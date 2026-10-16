#include "uploader.h"

#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <new>
#include <reading_buffer.h>
#include <upload_policy.h>

#include "config.h"
#include "diagnostics/events.h"
#include "net/ota_update.h"
#include "net/station_settings.h"
#include "net/time_sync.h"
#include "net/wifi_connection.h"
#include "root_ca.h"
#include "secrets.h"

// Fallback if the heap cannot hold the full 24 h (6 h).
static constexpr int FALLBACK_CAPACITY = 360;

static ReadingBuffer *buffer = nullptr;
// {"readings":[...],"events":[...]}: up to about 330 characters per reading (a 64-character
// device id) and 200 per event.
static char body[UPLOAD_BATCH_MAX * 360 + EVENT_LOG_CAPACITY * 200 + 64];
static int failuresInRow = 0;
static uint32_t backoffMs = 0;
static uint32_t nextAttemptMs = 0;
static uint32_t lastDropped = 0;

void uploaderBegin() {
  int capacity = BUFFER_CAPACITY;
  StationReading *storage = new (std::nothrow) StationReading[capacity];
  if (storage == nullptr) {
    capacity = FALLBACK_CAPACITY;
    storage = new (std::nothrow) StationReading[capacity];
  }
  if (storage == nullptr) {
    Serial.println("[upload] no memory for the buffer, readings will not be sent");
    return;
  }
  buffer = new ReadingBuffer(storage, capacity);
  Serial.printf("[upload] buffer for %d readings, free heap %u bytes\n", capacity, ESP.getFreeHeap());
}

void uploaderEnqueue(const StationReading &reading) {
  if (buffer == nullptr) {
    return;
  }
  buffer->push(reading);
  if (buffer->dropped() != lastDropped) {
    lastDropped = buffer->dropped();
    Serial.printf("[upload] buffer full, %lu oldest readings dropped so far\n", (unsigned long)lastDropped);
  }
}

int uploaderPending() { return buffer == nullptr ? 0 : buffer->size(); }

// Returns the HTTP code (negative: no response) and fills `body` with the response.
static int postBatch(const char *json, int length, String &body) {
  // Every wait is bounded well below the watchdog: TLS handshake would default to 120 s.
  WiFiClientSecure client;
  client.setCACert(ROOT_CA_PEM);
  client.setHandshakeTimeout(HTTP_TIMEOUT_MS / 1000);
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, INGEST_URL)) {
    return -1;
  }
  http.addHeader("content-type", "application/json");
  http.addHeader("x-device-key", stationDeviceKey());
  int code = http.POST((uint8_t *)json, length);
  if (code > 0) {
    body = http.getString();
  }
  if (code > 0 && code != 200) {
    Serial.printf("[upload] response: %s\n", body.c_str());
  }
  http.end();
  return code;
}

void uploaderLoop() {
  if (buffer == nullptr || buffer->empty() || !wifiIsConnected()) {
    return;
  }
  if ((int32_t)(millis() - nextAttemptMs) < 0) {
    return;
  }

  EventLog &events = eventLog();
  uint32_t lost = events.takeDropped();
  if (lost > 0) {
    logEvent("log", "%lu older events lost: the log was full", (unsigned long)lost);
  }

  int count = buffer->size() < UPLOAD_BATCH_MAX ? buffer->size() : UPLOAD_BATCH_MAX;
  int length = snprintf(body, sizeof(body), "{\"readings\":");
  int written = formatBatchJson(*buffer, count, body + length, sizeof(body) - length);
  if (written < 0) {
    logEvent("upload", "batch JSON does not fit, %d readings dropped", count);
    buffer->popFront(count);
    return;
  }
  length += written;
  length += snprintf(body + length, sizeof(body) - length, ",\"events\":");
  // Readings only exist with a valid clock, so events can be dated back from it.
  int eventCount = timeIsValid() ? events.size() : 0;
  written = formatEventsJson(events, eventCount, time(nullptr), millis(), body + length, sizeof(body) - length - 1);
  if (written < 0) {
    eventCount = 0;
    written = snprintf(body + length, sizeof(body) - length, "[]");
  }
  length += written;
  length += snprintf(body + length, sizeof(body) - length, "}");

  String response;
  int code = postBatch(body, length, response);
  switch (classifyResponse(code)) {
    case UploadOutcome::Delivered:
      buffer->popFront(count);
      events.popFront(eventCount);
      backoffMs = 0;
      nextAttemptMs = millis();
      Serial.printf("[upload] %d readings and %d events sent (HTTP %d), %d pending\n", count, eventCount, code,
                    buffer->size());
      if (failuresInRow > 0) {
        logEvent("upload", "back after %d failed attempts", failuresInRow);
        failuresInRow = 0;
      }
      otaOnDelivered(response.c_str());
      break;
    case UploadOutcome::Rejected:
      buffer->popFront(count);
      events.popFront(eventCount);
      backoffMs = 0;
      nextAttemptMs = millis();
      logEvent("upload", "%d readings rejected by the server (HTTP %d), dropped", count, code);
      break;
    case UploadOutcome::Retry:
      backoffMs = nextBackoffMs(backoffMs);
      nextAttemptMs = millis() + backoffMs;
      // Only the first failure in a row goes to the remote log; the rest only to serial.
      if (failuresInRow++ == 0) {
        logEvent("upload", "failing (%s %d), %d pending", code < 0 ? "error" : "HTTP", code, buffer->size());
      }
      Serial.printf("[upload] failed (%s %d), retry in %lu s, %d pending\n", code < 0 ? "error" : "HTTP", code,
                    (unsigned long)(backoffMs / 1000), buffer->size());
      break;
  }
}

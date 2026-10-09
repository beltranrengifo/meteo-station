#include "uploader.h"

#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <new>
#include <reading_buffer.h>
#include <upload_policy.h>

#include "config.h"
#include "net/wifi_connection.h"
#include "root_ca.h"
#include "secrets.h"

// Fallback if the heap cannot hold the full 24 h (6 h).
static constexpr int FALLBACK_CAPACITY = 360;

static ReadingBuffer *buffer = nullptr;
static char batchJson[UPLOAD_BATCH_MAX * 300];
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

static int postBatch(const char *json, int length) {
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
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.POST((uint8_t *)json, length);
  if (code > 0 && code != 200) {
    Serial.printf("[upload] response: %s\n", http.getString().c_str());
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

  int count = buffer->size() < UPLOAD_BATCH_MAX ? buffer->size() : UPLOAD_BATCH_MAX;
  int length = formatBatchJson(*buffer, count, batchJson, sizeof(batchJson));
  if (length < 0) {
    Serial.println("[upload] batch JSON does not fit, dropping it");
    buffer->popFront(count);
    return;
  }

  int code = postBatch(batchJson, length);
  switch (classifyResponse(code)) {
    case UploadOutcome::Delivered:
      buffer->popFront(count);
      backoffMs = 0;
      nextAttemptMs = millis();
      Serial.printf("[upload] %d readings sent (HTTP %d), %d pending\n", count, code, buffer->size());
      break;
    case UploadOutcome::Rejected:
      buffer->popFront(count);
      backoffMs = 0;
      nextAttemptMs = millis();
      Serial.printf("[upload] %d readings rejected by the server (HTTP %d), dropped\n", count, code);
      break;
    case UploadOutcome::Retry:
      backoffMs = nextBackoffMs(backoffMs);
      nextAttemptMs = millis() + backoffMs;
      Serial.printf("[upload] failed (%s %d), retry in %lu s, %d pending\n", code < 0 ? "error" : "HTTP", code,
                    (unsigned long)(backoffMs / 1000), buffer->size());
      break;
  }
}

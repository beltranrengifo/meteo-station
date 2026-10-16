#include "event_log.h"

#include <ArduinoJson.h>
#include <string.h>

static void copyCut(char *to, const char *from, int maxLength) {
  if (from == nullptr) {
    from = "";
  }
  strncpy(to, from, maxLength);
  to[maxLength] = '\0';
}

void EventLog::push(uint32_t atMs, const char *kind, const char *message) {
  int index;
  if (count_ == EVENT_LOG_CAPACITY) {
    index = head_;
    head_ = (head_ + 1) % EVENT_LOG_CAPACITY;
    dropped_++;
  } else {
    index = (head_ + count_) % EVENT_LOG_CAPACITY;
    count_++;
  }
  StationEvent &event = events_[index];
  event.atMs = atMs;
  copyCut(event.kind, kind, EVENT_KIND_MAX_LENGTH);
  copyCut(event.message, message, EVENT_MESSAGE_MAX_LENGTH);
}

void EventLog::popFront(int n) {
  if (n >= count_) {
    head_ = 0;
    count_ = 0;
    return;
  }
  if (n <= 0) {
    return;
  }
  head_ = (head_ + n) % EVENT_LOG_CAPACITY;
  count_ -= n;
}

const StationEvent &EventLog::at(int index) const { return events_[(head_ + index) % EVENT_LOG_CAPACITY]; }

uint32_t EventLog::takeDropped() {
  uint32_t dropped = dropped_;
  dropped_ = 0;
  return dropped;
}

int formatEventsJson(const EventLog &log, int count, time_t nowUtc, uint32_t nowMs, char *out, size_t size) {
  if (count > log.size()) {
    count = log.size();
  }
  JsonDocument doc;
  JsonArray events = doc.to<JsonArray>();
  for (int i = 0; i < count; i++) {
    const StationEvent &event = log.at(i);
    // Unsigned subtraction stays right across the millis() wrap (49 days).
    time_t at = nowUtc - (time_t)((nowMs - event.atMs) / 1000);
    char ts[21];
    struct tm utc;
    gmtime_r(&at, &utc);
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &utc);

    JsonObject item = events.add<JsonObject>();
    item["ts"] = ts;  // a char array: ArduinoJson copies it
    item["kind"] = event.kind;
    item["message"] = event.message;
  }
  if (doc.overflowed() || measureJson(doc) + 1 > size) {
    if (size > 0) {
      out[0] = '\0';
    }
    return -1;
  }
  return (int)serializeJson(doc, out, size);
}

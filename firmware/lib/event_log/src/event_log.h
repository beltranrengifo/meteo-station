#pragma once

#include <stddef.h>
#include <stdint.h>
#include <time.h>

// Station events for the remote log (public.device_events): boots, OTA steps, WiFi lost and
// back, upload failures, the setup portal. Kept in RAM until an upload delivers them. Pure code:
// runs in native unit tests.

constexpr int EVENT_LOG_CAPACITY = 32;
constexpr int EVENT_KIND_MAX_LENGTH = 16;     // the server allows 32
constexpr int EVENT_MESSAGE_MAX_LENGTH = 120;  // the server allows 200

struct StationEvent {
  uint32_t atMs;  // millis() when it happened; the clock may not be valid yet
  char kind[EVENT_KIND_MAX_LENGTH + 1];
  char message[EVENT_MESSAGE_MAX_LENGTH + 1];
};

// Fixed-size FIFO. When full, the oldest event is dropped: the newest say most about the state now.
class EventLog {
 public:
  // Longer kinds and messages are cut.
  void push(uint32_t atMs, const char *kind, const char *message);
  // Removes the n oldest events (all of them if n >= size).
  void popFront(int n);

  // 0 is the oldest event.
  const StationEvent &at(int index) const;
  int size() const { return count_; }
  bool empty() const { return count_ == 0; }

  // Events dropped because the log was full since the last call; resets the count.
  uint32_t takeDropped();

 private:
  StationEvent events_[EVENT_LOG_CAPACITY];
  int head_ = 0;  // index of the oldest event
  int count_ = 0;
  uint32_t dropped_ = 0;
};

// Writes the `count` oldest events as a JSON array of {ts, kind, message}. Each ts is UTC to
// the second: an event at atMs happened (nowMs - atMs) ms before nowUtc. Returns the length,
// or -1 if `out` is too small.
int formatEventsJson(const EventLog &log, int count, time_t nowUtc, uint32_t nowMs, char *out, size_t size);

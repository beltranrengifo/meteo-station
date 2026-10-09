#pragma once

#include <reading.h>

// Fixed-size FIFO of readings waiting to be sent. Pure code: runs in native unit tests.
// When full, the oldest reading is dropped: after a long outage the newest data is kept.
class ReadingBuffer {
 public:
  // `storage` must hold `capacity` readings and outlive the buffer.
  ReadingBuffer(StationReading *storage, int capacity);

  void push(const StationReading &reading);
  // Removes the n oldest readings (all of them if n >= size).
  void popFront(int n);

  // 0 is the oldest reading.
  const StationReading &at(int index) const;
  int size() const { return count_; }
  int capacity() const { return capacity_; }
  bool empty() const { return count_ == 0; }
  // Readings lost because the buffer was full.
  uint32_t dropped() const { return dropped_; }

 private:
  StationReading *storage_;
  int capacity_;
  int head_ = 0;  // index of the oldest reading
  int count_ = 0;
  uint32_t dropped_ = 0;
};

// Writes the `count` oldest readings as a JSON array. Returns the length, or -1 if `out` is too small.
int formatBatchJson(const ReadingBuffer &buffer, int count, char *out, size_t size);

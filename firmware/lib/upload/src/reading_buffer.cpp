#include "reading_buffer.h"

ReadingBuffer::ReadingBuffer(StationReading *storage, int capacity) : storage_(storage), capacity_(capacity) {}

void ReadingBuffer::push(const StationReading &reading) {
  if (capacity_ <= 0) {
    return;
  }
  if (count_ == capacity_) {
    head_ = (head_ + 1) % capacity_;
    count_--;
    dropped_++;
  }
  storage_[(head_ + count_) % capacity_] = reading;
  count_++;
}

void ReadingBuffer::popFront(int n) {
  if (n >= count_) {
    head_ = 0;
    count_ = 0;
    return;
  }
  if (n > 0) {
    head_ = (head_ + n) % capacity_;
    count_ -= n;
  }
}

const StationReading &ReadingBuffer::at(int index) const { return storage_[(head_ + index) % capacity_]; }

int formatBatchJson(const ReadingBuffer &buffer, int count, char *out, size_t size) {
  if (count > buffer.size()) {
    count = buffer.size();
  }
  // Room for "[", "]" and the terminating NUL.
  if (size < 3) {
    return -1;
  }
  size_t length = 0;
  out[length++] = '[';
  for (int i = 0; i < count; i++) {
    if (i > 0) {
      if (length + 1 >= size) return -1;
      out[length++] = ',';
    }
    // Leave one byte for "]".
    int written = formatReadingJson(buffer.at(i), out + length, size - length - 1);
    if (written < 0) {
      out[0] = '\0';
      return -1;
    }
    length += written;
  }
  if (length + 2 > size) {
    out[0] = '\0';
    return -1;
  }
  out[length++] = ']';
  out[length] = '\0';
  return (int)length;
}

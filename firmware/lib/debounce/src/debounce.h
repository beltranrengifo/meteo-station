#pragma once

#include <stdint.h>

// True if a pulse at nowMs is far enough from the last accepted one.
// Unsigned subtraction keeps it correct when millis() wraps around.
// Inline so it compiles into the interrupt handler (ISR code must live in IRAM).
inline bool debounceAccept(uint32_t nowMs, uint32_t lastAcceptedMs, uint32_t debounceMs) {
  return (uint32_t)(nowMs - lastAcceptedMs) >= debounceMs;
}

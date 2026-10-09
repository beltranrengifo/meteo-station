#pragma once

#include <stdint.h>

// What to do with a batch after a POST to the ingest function. Pure code: runs in native unit tests.
enum class UploadOutcome {
  Delivered,  // 2xx: remove the batch from the buffer
  Rejected,   // 400/413: the server will never accept it; remove it so it cannot block the buffer
  Retry,      // network error, wrong key, rate limit, server error: keep it and try later
};

UploadOutcome classifyResponse(int httpCode);

// Wait before the next attempt after a failure: 10 s, doubling up to 5 min. Pass 0 after a success.
uint32_t nextBackoffMs(uint32_t currentMs);

#include "upload_policy.h"

static constexpr uint32_t FIRST_BACKOFF_MS = 10000;
static constexpr uint32_t MAX_BACKOFF_MS = 300000;

UploadOutcome classifyResponse(int httpCode) {
  if (httpCode >= 200 && httpCode < 300) {
    return UploadOutcome::Delivered;
  }
  if (httpCode == 400 || httpCode == 413) {
    return UploadOutcome::Rejected;
  }
  return UploadOutcome::Retry;
}

uint32_t nextBackoffMs(uint32_t currentMs) {
  if (currentMs == 0) {
    return FIRST_BACKOFF_MS;
  }
  uint32_t next = currentMs * 2;
  return next > MAX_BACKOFF_MS ? MAX_BACKOFF_MS : next;
}

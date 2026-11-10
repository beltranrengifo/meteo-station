#include "rain_math.h"

float rainMmFromTips(uint32_t tips, float mmPerTip) { return tips * mmPerTip; }

bool rainLooksLikeNoise(uint32_t tips, uint32_t shortGaps, uint32_t maxTips, uint32_t maxShortGaps) {
  return tips > maxTips || shortGaps > maxShortGaps;
}

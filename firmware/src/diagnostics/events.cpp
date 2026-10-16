#include "events.h"

#include <esp_system.h>
#include <stdarg.h>

#include "config.h"

static EventLog events;

void logEvent(const char *kind, const char *format, ...) {
  char message[EVENT_MESSAGE_MAX_LENGTH + 1];
  va_list args;
  va_start(args, format);
  vsnprintf(message, sizeof(message), format, args);
  va_end(args);
  Serial.printf("[%s] %s\n", kind, message);
  events.push(millis(), kind, message);
}

static const char *resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "power on";
    case ESP_RST_EXT: return "reset pin";
    case ESP_RST_SW: return "restart by the firmware";
    case ESP_RST_PANIC: return "crash";
    case ESP_RST_INT_WDT: return "interrupt watchdog";
    case ESP_RST_TASK_WDT: return "task watchdog";
    case ESP_RST_WDT: return "other watchdog";
    case ESP_RST_DEEPSLEEP: return "deep sleep";
    case ESP_RST_BROWNOUT: return "brownout (power dipped)";
    case ESP_RST_SDIO: return "SDIO";
    default: return "unknown";
  }
}

void logBootEvent() {
  logEvent("boot", "fw %s, reset: %s", FW_VERSION, resetReasonName(esp_reset_reason()));
}

EventLog &eventLog() { return events; }

#pragma once

#include <Arduino.h>
#include <event_log.h>

// The station's remote log. logEvent() prints "[kind] message" on serial, as the other logs
// do, and keeps the event until an upload delivers it to public.device_events. Call it from
// the loop task only (never from a WiFi event handler).
void logEvent(const char *kind, const char *format, ...) __attribute__((format(printf, 2, 3)));

// First event after a boot: firmware version and why the board restarted.
void logBootEvent();

// Events waiting for the next upload (uploader.cpp).
EventLog &eventLog();

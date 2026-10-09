#pragma once

#include <reading.h>

// Allocates the offline buffer (24 h of readings).
void uploaderBegin();

// Queues a reading. It is sent by uploaderLoop() as soon as there is WiFi.
void uploaderEnqueue(const StationReading &reading);

// Call from loop(): sends the oldest pending readings in batches, with backoff on failure.
void uploaderLoop();

int uploaderPending();

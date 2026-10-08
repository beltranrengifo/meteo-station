#pragma once

// Prints one line per sensor with OK / WARN / FAIL. Runs at boot and when 's' is typed in the serial monitor.
void selfCheckPrint();

// Call from loop(): runs the self-check when 's' arrives over serial.
void selfCheckPollSerial();

#include "wifi_connection.h"

#include <WiFi.h>

#include "diagnostics/events.h"

static constexpr uint32_t RECONNECT_AFTER_MS = 30000;

static uint32_t disconnectedSince = 0;

// Written by the WiFi event task, read by the loop task.
static volatile bool linkUp = false;          // got an IP and has not lost the link since
static volatile uint32_t disconnects = 0;     // drops of an established link since boot
static volatile uint8_t lastDisconnectReason = 0;

// Loop task only: what the remote log last said.
static bool reportedUp = false;
static uint32_t lostAtMs = 0;  // 0 until the link is lost once

static const char *disconnectReasonName(uint8_t reason) {
  switch (reason) {
    case WIFI_REASON_NO_AP_FOUND: return "network not found";
    case WIFI_REASON_AUTH_FAIL: return "authentication failed";
    case WIFI_REASON_AUTH_EXPIRE: return "authentication expired";
    case WIFI_REASON_BEACON_TIMEOUT: return "beacon timeout";
    case WIFI_REASON_ASSOC_FAIL: return "association failed";
    case WIFI_REASON_HANDSHAKE_TIMEOUT: return "handshake timeout";
    // What the router answers to a wrong WPA2 password.
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT: return "4-way handshake timeout, wrong password?";
    default: return "other";
  }
}

static void onWifiEvent(arduino_event_id_t event, arduino_event_info_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[wifi] associated with access point");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      linkUp = true;
      Serial.printf("[wifi] connected, IP %s, RSSI %d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      lastDisconnectReason = info.wifi_sta_disconnected.reason;
      // Failed attempts while reconnecting fire this too; only a lost link counts as a drop.
      if (linkUp) {
        linkUp = false;
        disconnects++;
      }
      Serial.printf("[wifi] disconnected, reason %d (%s)\n",
                    info.wifi_sta_disconnected.reason,
                    disconnectReasonName(info.wifi_sta_disconnected.reason));
      break;
    default:
      break;
  }
}

// Connects to the network saved by the setup portal (the ESP32 WiFi driver keeps it in NVS).
static void beginSaved() {
  WiFi.begin();
}

void wifiBegin() {
  // Keep the default persistent mode: with persistent(false) the driver uses RAM only and
  // would not see the network saved by the portal. begin() without arguments and
  // disconnect() never change what is saved.
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // Modem sleep is on by default. Some routers handle it badly, and the station runs on mains
  // power, so keep the radio always on.
  WiFi.setSleep(false);
  WiFi.onEvent(onWifiEvent);
  Serial.println("[wifi] connecting to the saved network");
  beginSaved();
  disconnectedSince = millis();
}

void wifiRestart() {
  WiFi.mode(WIFI_STA);
  beginSaved();
  disconnectedSince = millis();
}

void wifiLoop() {
  if (WiFi.status() == WL_CONNECTED) {
    disconnectedSince = 0;
    return;
  }
  if (disconnectedSince == 0) {
    disconnectedSince = millis();
  }
  if (millis() - disconnectedSince > RECONNECT_AFTER_MS) {
    Serial.println("[wifi] still down, restarting connection");
    WiFi.disconnect();
    beginSaved();
    disconnectedSince = millis();
  }
}

void wifiWatch() {
  bool up = WiFi.status() == WL_CONNECTED;
  if (up == reportedUp) {
    return;
  }
  reportedUp = up;
  if (!up) {
    lostAtMs = millis();
    if (lostAtMs == 0) {
      lostAtMs = 1;
    }
    uint8_t reason = lastDisconnectReason;
    logEvent("wifi", "lost, reason %u (%s)", (unsigned)reason, disconnectReasonName(reason));
  } else if (lostAtMs == 0) {
    logEvent("wifi", "connected, RSSI %d dBm", WiFi.RSSI());
  } else {
    logEvent("wifi", "back after %lu s, RSSI %d dBm", (unsigned long)((millis() - lostAtMs) / 1000), WiFi.RSSI());
  }
}

uint32_t wifiDisconnects() { return disconnects; }

bool wifiIsConnected() { return WiFi.status() == WL_CONNECTED; }

int wifiRssi() { return WiFi.RSSI(); }

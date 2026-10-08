#include "wifi_connection.h"

#include <WiFi.h>

#include "secrets.h"

static constexpr uint32_t RECONNECT_AFTER_MS = 30000;

static uint32_t disconnectedSince = 0;

static const char *disconnectReasonName(uint8_t reason) {
  switch (reason) {
    case WIFI_REASON_NO_AP_FOUND: return "network not found";
    case WIFI_REASON_AUTH_FAIL: return "authentication failed";
    case WIFI_REASON_AUTH_EXPIRE: return "authentication expired";
    case WIFI_REASON_BEACON_TIMEOUT: return "beacon timeout";
    case WIFI_REASON_ASSOC_FAIL: return "association failed";
    case WIFI_REASON_HANDSHAKE_TIMEOUT: return "handshake timeout";
    default: return "other";
  }
}

static void onWifiEvent(arduino_event_id_t event, arduino_event_info_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[wifi] associated with access point");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("[wifi] connected, IP %s, RSSI %d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf("[wifi] disconnected, reason %d (%s)\n",
                    info.wifi_sta_disconnected.reason,
                    disconnectReasonName(info.wifi_sta_disconnected.reason));
      break;
    default:
      break;
  }
}

void wifiBegin() {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.onEvent(onWifiEvent);
  Serial.printf("[wifi] connecting to \"%s\"\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
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
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    disconnectedSince = millis();
  }
}

bool wifiIsConnected() { return WiFi.status() == WL_CONNECTED; }

int wifiRssi() { return WiFi.RSSI(); }

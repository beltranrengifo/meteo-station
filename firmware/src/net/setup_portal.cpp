#include "setup_portal.h"

#include <WiFiManager.h>
#include <station_setup.h>

#include "config.h"
#include "diagnostics/events.h"
#include "net/station_settings.h"
#include "net/wifi_connection.h"

static WiFiManager portal;
static WiFiManagerParameter idParam("device_id", "Device id (meteo-station-...)", "", DEVICE_ID_MAX_LENGTH);
// Never pre-filled, so the page never shows the saved key.
static WiFiManagerParameter keyParam("device_key", "Device key (empty: keep the saved one)", "", DEVICE_KEY_MAX_LENGTH,
                                     "type='password'");

static char apName[24];
static PortalReason openFor = PortalReason::None;
static uint32_t openedAtMs = 0;
static uint32_t tryingWifiSinceMs = 0;
static bool everConnected = false;
static bool asked = false;
static uint32_t buttonDownSinceMs = 0;
static bool settingsSaved = false;
static uint32_t restartAtMs = 0;  // set once the new WiFi connects

static const char *reasonName(PortalReason reason) {
  switch (reason) {
    case PortalReason::NotSetUp: return "station not set up";
    case PortalReason::Asked: return "asked";
    case PortalReason::NoWifi: return "saved WiFi never connected";
    default: return "";
  }
}

static void onSaveParams() {
  if (stationSettingsSave(idParam.getValue(), keyParam.getValue())) {
    // Restart once the new WiFi connects: settings are only read at boot.
    logEvent("setup", "settings saved, restarting when WiFi connects");
    settingsSaved = true;
  } else {
    logEvent("setup", "device id or key not valid, nothing saved");
  }
}

void setupPortalBegin() {
  pinMode(PIN_SETUP_BUTTON, INPUT_PULLUP);
  // Last two bytes of the MAC tell stations apart when several are set up at once.
  uint64_t mac = ESP.getEfuseMac();
  snprintf(apName, sizeof(apName), "meteo-setup-%02X%02X", (unsigned)((mac >> 32) & 0xff),
           (unsigned)((mac >> 40) & 0xff));
  idParam.setValue(stationDeviceId(), DEVICE_ID_MAX_LENGTH);

  portal.setConfigPortalBlocking(false);
  portal.setTitle("Meteo station");
  portal.addParameter(&idParam);
  portal.addParameter(&keyParam);
  portal.setSaveParamsCallback(onSaveParams);
  // On save WiFiManager blocks loop() while it tries the new network. Its default wait is the
  // core's 60 s, which with a wrong password trips the 60 s watchdog (WATCHDOG_TIMEOUT_S).
  portal.setSaveConnectTimeout(PORTAL_SAVE_CONNECT_TIMEOUT_S);
  // Without this WiFiManager keeps its debug output on serial.
  portal.setDebugOutput(false);
  tryingWifiSinceMs = millis();
}

bool setupPortalIsOpen() { return openFor != PortalReason::None; }

void setupPortalAsk() { asked = true; }

static void pollButton() {
  if (digitalRead(PIN_SETUP_BUTTON) == LOW) {
    if (buttonDownSinceMs == 0) {
      buttonDownSinceMs = millis();
    } else if (millis() - buttonDownSinceMs >= SETUP_BUTTON_HOLD_MS) {
      asked = true;
    }
  } else {
    buttonDownSinceMs = 0;
  }
}

static void closePortal() {
  logEvent("setup", "closing the setup portal, trying the saved WiFi");
  portal.stopConfigPortal();
  openFor = PortalReason::None;
  wifiRestart();
  tryingWifiSinceMs = millis();
}

void setupPortalLoop() {
  if (wifiIsConnected()) {
    everConnected = true;
  }
  pollButton();

  if (setupPortalIsOpen()) {
    portal.process();
    if (settingsSaved && restartAtMs == 0 && wifiIsConnected()) {
      restartAtMs = millis() + 2000;  // time for the page to answer
    }
    if (restartAtMs != 0 && (int32_t)(millis() - restartAtMs) >= 0) {
      logEvent("setup", "restarting with the new settings");
      ESP.restart();
    }
    if (!settingsSaved && portalShouldClose(openFor, millis() - openedAtMs)) {
      closePortal();
    }
    return;
  }

  PortalState state = {stationIsSetUp(), asked, everConnected, millis() - tryingWifiSinceMs};
  PortalReason reason = portalReason(state);
  asked = false;
  if (reason == PortalReason::None) {
    return;
  }
  logEvent("setup", "opening the setup portal (%s): join the WiFi network \"%s\"", reasonName(reason), apName);
  openFor = reason;
  openedAtMs = millis();
  portal.startConfigPortal(apName);
}

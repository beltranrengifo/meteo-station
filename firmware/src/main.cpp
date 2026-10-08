#include <Arduino.h>

volatile unsigned long tips = 0;

void IRAM_ATTR countTip() {
  tips++;
}

void setup() {
  Serial.begin(115200);
  pinMode(33, INPUT_PULLUP);
  attachInterrupt(33, countTip, FALLING);
  Serial.println("Rain gauge ready");
}

void loop() {
  Serial.print("Tips: ");
  Serial.println(tips);
  delay(500);
}
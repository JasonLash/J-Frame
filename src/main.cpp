#include <U8g2lib.h>
#include <Arduino.h>
#include <WiFi.h>
#include "qrcode.h"
#include <SD.h>
#include "SPIFFS.h"
#include <SPI.h>
#include "FS.h"
#include <JPEGDEC.h>
#include <Arduino_GFX_Library.h>
#include <Adafruit_I2CDevice.h>
#include <XPT2046_Touchscreen.h>
#include <Update.h>
#include "MjpegClass.h"
#include <DNSServer.h>
#include <ArduinoJson.h>
#include "AsyncJson.h"
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

const String FRAMEID = "T00";


AsyncWebServer server(80);

//#define WIFI_SSID "J and L"
#define WIFI_SSID "FRAME"
#define WIFI_PSK  "thankyoufortheinternet"

const String webName = "jframe.cam";
DNSServer dnsServer;
const byte DNS_PORT = 53;

#define SCK 18
#define MOSI 23
#define MISO 19

#define LCD_BRIGHTNESS 200
#define LCD_BL 22
#define LCD_DC 27
#define LCD_CS 5
#define LCD_RESET 33

#define SD_CS 21

#define TOUCH_CS  15
XPT2046_Touchscreen ts(TOUCH_CS);

#define MJPEG_FILENAME "/frameVideo.mjpeg"
#define FPS 10
#define MJPEG_BUFFER_SIZE (320 * 240 * 2 / 4)

Arduino_DataBus *bus = new Arduino_HWSPI(LCD_DC, LCD_CS, SCK, MOSI, MISO);
Arduino_GFX *gfx = new Arduino_ILI9341(bus, LCD_RESET, 0 /* rotation */, false /* IPS */);
static MjpegClass mjpeg;
uint8_t *mjpeg_buf;

static unsigned long start_ms, curr_ms, next_frame_ms, touch_start_ms, touch_current_ms;
static int next_frame;
bool playVideo = false;
String wifiQR;
bool printedSecondQR = false;
bool videoFileFound = false;
bool pauseVideo = false;
bool drewPause = false;

class ButtonData {
  public:
    int x;
    int y;
    int width;
    int height;
};

ButtonData resetFrameButton;

int startTime;
int endTime;
String timeDiff;

//////////Setup
void setupLCD(){
  Serial.println(("Setting up LCD"));
  gfx->begin();
  gfx->displayOn();

  ledcAttachPin(LCD_BL, 1);     // assign LCD_BL pin to channel 1
  ledcSetup(1, 12000, 8);       // 12 kHz PWM, 8-bit resolution
  ledcWrite(1, LCD_BRIGHTNESS); // brightness 0 - 255

  mjpeg_buf = (uint8_t *)malloc(MJPEG_BUFFER_SIZE);
  if (!mjpeg_buf)
  {
    Serial.println(F("mjpeg_buf malloc failed!"));
    gfx->println(F("mjpeg_buf malloc failed!"));
    exit(1);
  }

  gfx->setFont(u8g2_font_profont15_mf);

  Serial.println(("Done setting up LCD"));
}

void setupSD(){
  Serial.println(("Setting up SD card"));
  if ((!SD.begin(SD_CS)))
  {
    Serial.println(F("ERROR: SD card mount failed!"));
    gfx->println(F("ERROR: SD card mount failed!"));
    exit(1);
  }
  
  Serial.println(("Done setting up SD card"));
}




////////////////Draw Logic

static int drawMCU(JPEGDRAW *pDraw)
{
  unsigned long start = millis();
  gfx->draw16bitBeRGBBitmap(pDraw->x, pDraw->y, pDraw->pPixels, pDraw->iWidth, pDraw->iHeight);
  return 1;
}

void drawPauseMenu(){
  gfx->fillRoundRect(resetFrameButton.x, resetFrameButton.y, resetFrameButton.width , resetFrameButton.height, 10, 0x7BEF);
  gfx->setCursor(45, 165);
  gfx->setTextSize(2);
  gfx->setTextColor(BLACK);
  gfx->println("Reset Frame");
}

bool checkIfInRect(int recX, int recY, int recW, int recH, int clickX, int clickY){
  if(clickX > recX &&  clickX < recX + recW){
    if(clickY > recY &&  clickY < recY + recH){
      return true;
    }
  }

  return false;
}

void drawQRCode(String inputString, String stepString){
  gfx->fillScreen(WHITE);
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  char Buf[inputString.length()];
  inputString.toCharArray(Buf, inputString.length());
  qrcode_initText(&qrcode, qrcodeData, 3, 0, Buf);

  

  int QRxBegin = 60;
  int QRyBegin = 100;
  int QRmoduleSize = 4;


  // Draw QR code
  for (uint8_t y = 0; y < qrcode.size; y++) {
    // Each horizontal module
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if(qrcode_getModule(&qrcode, x, y)){
        gfx->fillRect(QRxBegin+ x*QRmoduleSize, QRyBegin + y*QRmoduleSize, QRmoduleSize, QRmoduleSize, gfx->color565(0,0,0));
      }
    }
  }

  gfx->setCursor(80, 20);
  gfx->setTextSize(2);
  gfx->setTextColor(BLACK);
  gfx->println(stepString);


  gfx->setCursor(80, 43);
  gfx->setTextSize(3);
  gfx->setTextColor(BLACK);
  gfx->println("SCAN");
}


void setupButtons(){
  resetFrameButton.x = 30;
  resetFrameButton.y = 140;
  resetFrameButton.width = 180;
  resetFrameButton.height = 38;
}

void videoLoop(){
  File vFile = SD.open(MJPEG_FILENAME);
  if (!vFile || vFile.isDirectory())
  {
    Serial.println(F("ERROR: Failed to open " MJPEG_FILENAME " file for reading"));
    gfx->println(F("ERROR: Failed to open " MJPEG_FILENAME " file for reading"));
    exit(1);
  }

  Serial.println(F("Video start"));

  // init Video
  mjpeg.setup(&vFile, mjpeg_buf, drawMCU, false, true);

  next_frame = 0;
  start_ms = millis();
  curr_ms = start_ms;
  next_frame_ms = start_ms + (++next_frame * 1000 / FPS);

  pauseVideo = false;
  drewPause = false;
  
  while (vFile.available() && mjpeg.readMjpegBuf()) // Read video
  {
    while(pauseVideo){
      if(!drewPause){
        drawPauseMenu();
        delay(500);
        drewPause = true;
      }

      if (ts.touched()) {
        TS_Point p = ts.getPoint();
        int touchWH = 3900;
        int mapedX = map(p.x, 250, touchWH, 240, 0);;
        int mapedY = map(p.y, 250, touchWH, 320, 0);;
        Serial.println(checkIfInRect(resetFrameButton.x, resetFrameButton.y, resetFrameButton.width, resetFrameButton.height, p.x, p.y));
        if(checkIfInRect(resetFrameButton.x, resetFrameButton.y, resetFrameButton.width, resetFrameButton.height, mapedX, mapedY)){
          SD.remove(MJPEG_FILENAME);
          Serial.println("Removed video");
          ESP.restart();
        }else {
          pauseVideo = false;
          videoLoop();
        }
      }
    }
    curr_ms = millis();

    //check if touched and for how long
    if (ts.touched()) {
      if(millis() - touch_current_ms < 200){
        touch_current_ms = millis();
      } else {
        touch_start_ms = millis();
      }

      if(millis() - touch_start_ms > 1000){
        touch_current_ms = millis();
        touch_start_ms = millis();
        pauseVideo = true;
      }

      if(millis() - touch_current_ms > 2000){
        touch_current_ms = millis();
        touch_start_ms = millis();
      }
    }

    if (millis() < next_frame_ms)
    {
      mjpeg.drawJpg();
    }
    curr_ms = millis();

    while (millis() < next_frame_ms)
    {
      vTaskDelay(1);
    }

    curr_ms = millis();
    next_frame_ms = start_ms + (++next_frame * 1000 / FPS);
  }
  Serial.println(F("Video end"));
  vFile.close();

  Serial.println(F("Going to sleep"));
  ledcDetachPin(LCD_BL);
  gfx->displayOff();
  
  esp_deep_sleep_start();
}

//////////WEB Logic

void setupServer(){
  Serial.println("Setting up WiFi");
  WiFi.softAP(WIFI_SSID, WIFI_PSK);
  Serial.print("Connected. IP=");
  Serial.println(WiFi.softAPIP());
  wifiQR = "";
  wifiQR = wifiQR + "https://" + WiFi.softAPIP().toString().c_str() + "/";

  //setting DNS
  dnsServer.start(DNS_PORT, webName, WiFi.softAPIP());

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/index.html", String(), false);
  });

  server.on("/getFrameID", HTTP_GET, [](AsyncWebServerRequest *request){
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    DynamicJsonBuffer jsonBuffer;
    JsonObject &root = jsonBuffer.createObject();
    root["id"] = FRAMEID;
    root.printTo(*response);
    request->send(response);
  });

  server.on("/disconnect", HTTP_GET, [] (AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "OK");
    WiFi.softAPdisconnect(true);
  });

  server.begin();
}

void drawWifiQR(){
  setupServer();
  gfx->fillScreen(WHITE);
  String wifiQR = "";
  wifiQR = wifiQR + "WIFI:S:" + WIFI_SSID + ";T:WPA;P:" + WIFI_PSK + ";;";
  drawQRCode(wifiQR, "Step 1");
  playVideo = false;
}

void setup()
{
  Serial.begin(115200);

  if (!SPIFFS.begin(true)) Serial.println("Mounting SPIFFS failed");
  
  setupLCD();
  setupSD();
  //setupServer();
  setupButtons();
  
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_14,0);

  File vFile = SD.open(MJPEG_FILENAME);
  if (!vFile || vFile.isDirectory())
  {
    drawWifiQR();
  } else {
    playVideo = true;
    printedSecondQR = true;
    videoFileFound = true;
  }

  ts.begin();
  ts.setRotation(0);
}



void loop()
{
  dnsServer.processNextRequest();

  if(!videoFileFound){
    if(WiFi.softAPgetStationNum() > 0 && !printedSecondQR){
      drawQRCode(wifiQR ,"Step 2");
      printedSecondQR = true;
    }
  }
  
  if(playVideo){
    videoLoop();
  }

}
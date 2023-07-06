#include <U8g2lib.h>
#include <Arduino.h>
#include <WiFi.h>
#include "qrcode.h"
#include <SD.h>
#include "SPIFFS.h"
#include <SPI.h>
#include "FS.h"
#include "MjpegClass.h"
#include <JPEGDEC.h>
#include <Arduino_GFX_Library.h>
#include <Adafruit_I2CDevice.h>
#include <XPT2046_Touchscreen.h>
#include <Update.h>
#include <DNSServer.h>
#include <SSLCert.hpp>
#include <HTTPRequest.hpp>
#include <HTTPResponse.hpp>
#include <HTTPSServer.hpp>
#include <HTTPServer.hpp>
#include <HTTPBodyParser.hpp>
#include <HTTPMultipartBodyParser.hpp>
#include <HTTPURLEncodedBodyParser.hpp>
#include <ArduinoJson.h>
#include "FFat.h"

#include "cert.h"
#include "private_key.h"

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

#define BAT_PIN A13

const String FRAMEID = "002";
const String webName = "jframe.cam";

using namespace httpsserver;

HTTPSServer * secureServer;
HTTPServer * insecureServer;

#define WIFI_SSID "FRAME"
#define WIFI_PSK  "framepass"

void handleRoot(HTTPRequest * req, HTTPResponse * res);
void handle404(HTTPRequest * req, HTTPResponse * res);
void uploadFile(HTTPRequest * req, HTTPResponse * res);
void uploadSpiffs(HTTPRequest * req, HTTPResponse * res);
void handleRedirect(HTTPRequest * req, HTTPResponse * res);
void handleFrameID(HTTPRequest * req, HTTPResponse * res);
void handleSPIFFS(HTTPRequest * req, HTTPResponse * res);

char contentTypes[][2][32] = {
  {".html", "text/html"},
  {".css",  "text/css"},
  {".js",   "application/javascript"},
  {".json", "application/json"},
  {".png",  "image/png"},
  {".jpg",  "image/jpg"},
  {"", ""}
};

const byte DNS_PORT = 53;
DNSServer dnsServer;

XPT2046_Touchscreen ts(TOUCH_CS);

static MjpegClass mjpeg;
uint8_t *mjpeg_buf;

#define MJPEG_FILENAME "/frameVideo.mjpeg"
#define FPS 10
#define MJPEG_BUFFER_SIZE (320 * 240 * 2 / 4)

Arduino_DataBus *bus = new Arduino_HWSPI(LCD_DC, LCD_CS, SCK, MOSI, MISO);
Arduino_GFX *gfx = new Arduino_ILI9341(bus, LCD_RESET, 0 /* rotation */, false /* IPS */);

static unsigned long startTime, currentTime, nextFrameTime, touchStartTime, touchCurrentTime;
static int nextFrame;
bool playVideo, printedSecondQR, videoFileFound, pauseVideo, drewPause;

String wifiQR;

class ButtonData {
  public:
    int x;
    int y;
    int width;
    int height;
};

ButtonData resetFrameButton;
ButtonData sleepButton;

int spiffsStartTime;
int spiffsendTime;
String timeDiff;

bool touchedSleepBTN = false;

float batteryVoltage;

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

  gfx->setFont(u8g2_font_luRS12_tf);

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

////////////////Support
void getBatteryLevel(){
  batteryVoltage = analogReadMilliVolts(BAT_PIN);
  //batteryVoltage = 1;
  batteryVoltage *= 2;    // we divided by 2, so multiply back
  batteryVoltage /= 1000; // convert to volts!
}

////////////////Draw Logic

static int drawMCU(JPEGDRAW *pDraw){
  unsigned long start = millis();
  gfx->draw16bitBeRGBBitmap(pDraw->x, pDraw->y, pDraw->pPixels, pDraw->iWidth, pDraw->iHeight);
  return 1;
}

void drawPauseMenu(){
  gfx->fillRoundRect(resetFrameButton.x - 5, resetFrameButton.y - 5, resetFrameButton.width + 10 , resetFrameButton.height + 10, 15, gfx->color565(60, 60, 60));
  gfx->fillRoundRect(resetFrameButton.x, resetFrameButton.y, resetFrameButton.width , resetFrameButton.height, 10, 0x7BEF);
  gfx->setCursor(75, 172);
  gfx->setTextSize(2);
  gfx->setTextColor(BLACK);
  gfx->println("Reset");

  // getBatteryLevel();
  // String batlvl = String(batteryVoltage);
  // gfx->setCursor(75, 190);
  // gfx->setTextSize(2);
  // gfx->setTextColor(RED);
  // gfx->println("bat:");
  // gfx->println(batlvl);
}

void drawSleepButton(){
  gfx->fillRoundRect(sleepButton.x - 5, sleepButton.y - 5, sleepButton.width + 10, sleepButton.height + 10, 15, gfx->color565(60, 60, 60));
  gfx->fillRoundRect(sleepButton.x, sleepButton.y, sleepButton.width , sleepButton.height, 10, 0x7BEF);
  gfx->setCursor(75, 290);
  gfx->setTextSize(2);
  gfx->setTextColor(BLACK);
  gfx->println("Sleep");
}

bool checkIfInRect(int recX, int recY, int recW, int recH, int clickX, int clickY){
  if(clickX > recX &&  clickX < recX + recW){
    if(clickY > recY &&  clickY < recY + recH){
      return true;
    }
  }

  return false;
}

void checkTouch(){
  if (ts.touched()) {
    TS_Point p = ts.getPoint();
    int touchWH = 3900;
    int mapedX = map(p.x, 250, touchWH, 240, 0);
    int mapedY = map(p.y, 250, touchWH, 320, 0);
    if(checkIfInRect(sleepButton.x, sleepButton.y, sleepButton.width, sleepButton.height, mapedX, mapedY)){
      touchedSleepBTN = true;
    }
  }else{
    if(touchedSleepBTN){
      Serial.println("Going to sleep...");
      delay(400);
      esp_deep_sleep_start();
    }
  }
}


void drawQRCode(String inputString, int stepNumber){
  gfx->fillScreen(WHITE);
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  char Buf[inputString.length()];
  inputString.toCharArray(Buf, inputString.length());
  qrcode_initText(&qrcode, qrcodeData, 3, 0, Buf);

  int QRxBegin = 60;
  int QRyBegin = 80;
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

  gfx->setCursor(15, 28);
  gfx->setTextSize(2);
  gfx->setTextColor(BLACK);
  gfx->print("FRAME #");
  gfx->print(FRAMEID);

  gfx->setCursor(65, 50);
  gfx->setTextSize(1);
  gfx->setTextColor(BLACK);
  gfx->println("Scan QR Code");

  if(stepNumber == 1){
    gfx->setCursor(40, 65);
    gfx->setTextSize(1);
    gfx->setTextColor(BLACK);
    gfx->println("or connect manually");

    gfx->setCursor(50, 222);
    gfx->setTextSize(1);
    gfx->setTextColor(BLACK);
    gfx->print("SSID: FRAME");
    gfx->print(FRAMEID);

    
    gfx->setCursor(50, 242);
    gfx->setTextSize(1);
    gfx->setTextColor(BLACK);
    gfx->print("PASS: ");
    gfx->print(WIFI_PSK);

  }else if(stepNumber == 2){
    gfx->setCursor(38, 65);
    gfx->setTextSize(1);
    gfx->setTextColor(BLACK);
    gfx->println("or the vist site below");

    gfx->setCursor(40, 222);
    gfx->setTextSize(1);
    gfx->setTextColor(BLACK);
    gfx->println("https://jframe.cam");
  }

  drawSleepButton();
}


void setupButtons(){
  resetFrameButton.x = 30;
  resetFrameButton.y = 140;
  resetFrameButton.width = 180;
  resetFrameButton.height = 38;

  sleepButton.x = 30;
  sleepButton.y = 260;
  sleepButton.width = 180;
  sleepButton.height = 38;
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

  nextFrame = 0;
  startTime = millis();
  currentTime = startTime;
  nextFrameTime = startTime + (++nextFrame * 1000 / FPS);

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
    currentTime = millis();

    //check if touched and for how long
    if (ts.touched()) {
      if(millis() - touchCurrentTime < 200){
        touchCurrentTime = millis();
      } else {
        touchStartTime = millis();
      }

      if(millis() - touchStartTime > 1000){
        touchCurrentTime = millis();
        touchStartTime = millis();
        pauseVideo = true;
      }

      if(millis() - touchCurrentTime > 2000){
        touchCurrentTime = millis();
        touchStartTime = millis();
      }
    }

    if (millis() < nextFrameTime)
    {
      mjpeg.drawJpg();
    }
    currentTime = millis();

    while (millis() < nextFrameTime)
    {
      vTaskDelay(1);
    }

    currentTime = millis();
    nextFrameTime = startTime + (++nextFrame * 1000 / FPS);
  }
  Serial.println(F("Video end"));
  vFile.close();

  Serial.println(F("Going to sleep"));
  ledcDetachPin(LCD_BL);
  gfx->displayOff();
  
  esp_deep_sleep_start();
}

//////////WEB Logic

void downloadBoilerplate(HTTPRequest * req, HTTPResponse * res, String saveType){
  Serial.printf("trying file upload");
  res->setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res->setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

  HTTPBodyParser *parser;
  std::string contentType = req->getHeader("Content-Type");

  size_t semicolonPos = contentType.find(";");
  if (semicolonPos != std::string::npos) {
    contentType = contentType.substr(0, semicolonPos);
  }

  if (contentType == "multipart/form-data") {
    parser = new HTTPMultipartBodyParser(req);
  } else {
    Serial.printf("Unknown POST Content-Type: %s\n", contentType.c_str());
    return;
  }

  bool didwrite = false;

  while(parser->nextField()) {
    std::string name = parser->getFieldName();
    std::string filename = parser->getFieldFilename();
    std::string mimeType = parser->getFieldMimeType();
    //Serial.printf("handleFormUpload: field name='%s', filename='%s', mimetype='%s'\n", name.c_str(), filename.c_str(), mimeType.c_str());
    
    std::string pathname = "/" + filename;
    File file;
    if(saveType == "SD"){
      file = SD.open(pathname.c_str(), FILE_WRITE);
    }else if(saveType == "SPIFFS"){
      file = SPIFFS.open(pathname.c_str(), FILE_WRITE);
    }else{
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    }
    
    size_t fileLength = 0;
    didwrite = true;

    while (!parser->endOfField()) {
      byte buf[512];
      size_t readLength = parser->read(buf, 512);
      if(saveType == "UPDATE"){
        Update.write(buf, readLength);
      }else{
        file.write(buf, readLength);
        fileLength += readLength;
      }

    }
    file.close();
    Serial.printf("Saved %d bytes to %s", (int)fileLength, pathname.c_str());
  }

  if(saveType == "UPDATE"){
     if (Update.end(true)) {
      Serial.printf("Update Success... Rebooting...");
      ESP.restart();
    } else {
      Update.printError(Serial);
    }

  }
  if (!didwrite) {
    Serial.printf("Did not write any file");
  }else if(saveType == "SD"){
    playVideo = true;
  }

  delete parser;
}

void simpleRequest(HTTPRequest * req, HTTPResponse * res, String fileName, String contentType, bool doSD){
  //Serial.printf("Requested: %s Content Type: %s", fileName, contentType);
  //Serial.println();
  File file;
  if(doSD){
    file = SD.open(fileName, "r");
  }else{
    file = SPIFFS.open(fileName, "r");
  }
  
    
  uint8_t buffer[256];
  size_t length = 0;

  unsigned int fileSize = file.size();
  res->setHeader("Content-Length", String(fileSize).c_str());
  res->setHeader("Content-Type", contentType.c_str());
  res->setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res->setHeader("Cross-Origin-Embedder-Policy", "require-corp");

   Serial.println(String(fileSize).c_str());

  do {
      length = file.read(buffer, 256);
      res->write(buffer, length);
  } while (length > 0);

  file.close();
}

//File uploads
void handleVideoUpload(HTTPRequest * req, HTTPResponse * res) {
  downloadBoilerplate(req, res, "SD");
}

void handleSpiffsUpload(HTTPRequest * req, HTTPResponse * res) {
  downloadBoilerplate(req, res, "SPIFFS");
}

void handleFirmwareUpload(HTTPRequest * req, HTTPResponse * res) {
  downloadBoilerplate(req, res, "UPDATE");
}

void handleUpdatePage(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/uploadSpiffs.html", "text/html", false);
}

void handleFrameID(HTTPRequest * req, HTTPResponse * res){
  StaticJsonBuffer<JSON_OBJECT_SIZE(1)> jsonBuffer;
  JsonObject& obj = jsonBuffer.createObject();
  obj["frameID"] = FRAMEID.c_str();
  res->setHeader("Content-Type", "application/json");
  obj.printTo(*res);
}

void handleRedirect(HTTPRequest * req, HTTPResponse * res) {
  req->discardRequestBody();
  res->setStatusCode(308);
  res->setStatusText("Redirect");
  res->setHeader("Content-Type", "text/html");
  res->println("<!DOCTYPE html>");
  res->println("<HEAD>");
  res->println("<meta http-equiv=\"refresh\" content=\"0;url=https://jframe.cam/\">");
  res->println("</head>");
}


//this isn't used anymore
void handle404(HTTPRequest * req, HTTPResponse * res) {
  req->discardRequestBody();
  res->setStatusCode(404);
  res->setStatusText("Not Found");
  res->setHeader("Content-Type", "text/html");
  res->println("<!DOCTYPE html>");
  res->println("<html>");
  res->println("<head><title>Not Found</title></head>");
  res->println("<body><h1>404 Not Found</h1><p>The requested resource was not found on this server.</p></body>");
  res->println("</html>");
}

void handleSPIFFS(HTTPRequest * req, HTTPResponse * res) {
  // We only handle GET here
  if (req->getMethod() == "GET") {
    // Redirect / to /index.html
    std::string reqFile = req->getRequestString()=="/" ? "/index.html" : req->getRequestString();

    // Try to open the file
    std::string filename = reqFile;

    // Check if the file exists
    if (!SPIFFS.exists(filename.c_str())) {
      // Send "404 Not Found" as response, as the file doesn't seem to exist
      res->setStatusCode(404);
      res->setStatusText("Not found");
      res->println("404 Not Found");
      return;
    }

    spiffsStartTime = millis();
    File file = SPIFFS.open(filename.c_str());

    res->setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res->setHeader("Cross-Origin-Embedder-Policy", "require-corp");

    // Set length
    res->setHeader("Content-Length", httpsserver::intToString(file.size()));

    // Content-Type is guessed using the definition of the contentTypes-table defined above
    int cTypeIdx = 0;
    do {
      if(reqFile.rfind(contentTypes[cTypeIdx][0])!=std::string::npos) {
        res->setHeader("Content-Type", contentTypes[cTypeIdx][1]);
        break;
      }
      cTypeIdx+=1;
    } while(strlen(contentTypes[cTypeIdx][0])>0);

    // Read the file and write it to the response
    uint8_t buffer[256];
    size_t length = 0;
    do {
      length = file.read(buffer, 256);
      res->write(buffer, length);
    } while (length > 0);

    file.close();

    spiffsendTime = millis() - spiffsStartTime;
    timeDiff = String(spiffsendTime);
    Serial.printf("time to send File %s was %s: ", filename.c_str(), timeDiff.c_str());
    Serial.println();
  } else {
    // If there's any body, discard it
    req->discardRequestBody();
    // Send "405 Method not allowed" as response
    res->setStatusCode(405);
    res->setStatusText("Method not allowed");
    res->println("405 Method not allowed");
  }
}




void setupServer(){
  SSLCert cert = SSLCert(example_crt_DER, example_crt_DER_len, example_key_DER, example_key_DER_len);
  secureServer = new HTTPSServer(&cert);
  //insecureServer = new HTTPServer();

  Serial.println("Setting up WiFi");
  String wifiName = "FRAME" + FRAMEID;
  WiFi.softAP(wifiName.c_str(), WIFI_PSK);
  Serial.print("Connected. IP=");
  Serial.println(WiFi.softAPIP());
  wifiQR = "";
  wifiQR = wifiQR + "https://" + webName.c_str() + "/";
  //wifiQR = wifiQR + "https://" + WiFi.softAPIP().toString().c_str() + "/";


  ResourceNode * nodeUploadPage    = new ResourceNode("/updatePage", "GET", &handleUpdatePage);
  
  ResourceNode * nodeUpload = new ResourceNode("/upload", "POST", &handleVideoUpload);
  ResourceNode * updateSpiffs = new ResourceNode("/updateSpiffs", "POST", &handleSpiffsUpload);
  ResourceNode * updateFirmware = new ResourceNode("/updateFirmware", "POST", &handleFirmwareUpload);

  ResourceNode * nodeRedirect = new ResourceNode("/", "GET", &handleRedirect);
  ResourceNode * nodeRedirect404 = new ResourceNode("", "GET", &handleRedirect);
  ResourceNode * nodeFrameID = new ResourceNode("/getFrameID", "GET", &handleFrameID);

  ResourceNode * spiffsNode = new ResourceNode("", "", &handleSPIFFS);
  secureServer->setDefaultNode(spiffsNode);

  secureServer->registerNode(nodeUploadPage);
  secureServer->registerNode(nodeUpload);
  secureServer->registerNode(updateSpiffs);
  secureServer->registerNode(updateFirmware);
  secureServer->registerNode(nodeFrameID);

  //insecureServer->setDefaultNode(nodeRedirect);
  //insecureServer->registerNode(nodeRedirect404);

  //setting DNS
  dnsServer.start(DNS_PORT, webName, WiFi.softAPIP());


  Serial.println("Starting server...");
  secureServer->start();
  //insecureServer->start();
  //if (secureServer->isRunning() && insecureServer->isRunning()) {
  if (secureServer->isRunning() ) {
    Serial.println("Server ready.");
  }


}

void drawWifiQR(){
  setupServer();
  gfx->fillScreen(WHITE);
  String wifiQR = "";
  String wifiName = "FRAME" + FRAMEID;
  wifiQR = wifiQR + "WIFI:S:" + wifiName.c_str() + ";T:WPA;P:" + WIFI_PSK + ";;";
  drawQRCode(wifiQR, 1);
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
  if(!videoFileFound){
    //insecureServer->loop();
    secureServer->loop();
    dnsServer.processNextRequest();
    checkTouch();

    if(WiFi.softAPgetStationNum() > 0 && !printedSecondQR){
      drawQRCode(wifiQR , 2);
      printedSecondQR = true;
    }
  }
  
  if(playVideo){
    videoLoop();
  }

  delay(100);
}
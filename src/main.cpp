#define MJPEG_FILENAME "/pleaseworkvideo.mjpeg"
#define FPS 10
#define MJPEG_BUFFER_SIZE (320 * 240 * 2 / 4)
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

#include <SSLCert.hpp>
#include <HTTPRequest.hpp>
#include <HTTPResponse.hpp>
#include <esp32/sha.h>
#include <HTTPSServer.hpp>
#include <HTTPServer.hpp>
#include <HTTPBodyParser.hpp>
#include <HTTPMultipartBodyParser.hpp>
#include <HTTPURLEncodedBodyParser.hpp>
#include "MjpegClass.h"

#include "cert.h"
#include "private_key.h"

#include <DNSServer.h>


using namespace httpsserver;

//#define WIFI_SSID "J and L"
#define WIFI_SSID "FRAME"
#define WIFI_PSK  "thankyoufortheinternet"

/** Check if we have multiple cores */
#if CONFIG_FREERTOS_UNICORE
#define ARDUINO_RUNNING_CORE 0
#else
#define ARDUINO_RUNNING_CORE 1
#endif




HTTPSServer * secureServer;
HTTPServer * insecureServer;

void handleRoot(HTTPRequest * req, HTTPResponse * res);
void handle404(HTTPRequest * req, HTTPResponse * res);
void uploadFile(HTTPRequest * req, HTTPResponse * res);
void uploadSpiffs(HTTPRequest * req, HTTPResponse * res);
void getffmpeg(HTTPRequest * req, HTTPResponse * res);
void getCSSBundle(HTTPRequest * req, HTTPResponse * res);
void getJSBundle(HTTPRequest * req, HTTPResponse * res);
void getJSMap(HTTPRequest * req, HTTPResponse * res);
void getGlobalCSS(HTTPRequest * req, HTTPResponse * res);
void getManifest(HTTPRequest * req, HTTPResponse * res);
void getServiceWorker(HTTPRequest * req, HTTPResponse * res);

void getFFmpegWASM(HTTPRequest * req, HTTPResponse * res);

void handleRedirect(HTTPRequest * req, HTTPResponse * res);


//spiifs test
void handleSPIFFS(HTTPRequest * req, HTTPResponse * res);
// We need to specify some content-type mapping, so the resources get delivered with the
// right content type and are displayed correctly in the browser
char contentTypes[][2][32] = {
  {".html", "text/html"},
  {".css",  "text/css"},
  {".js",   "application/javascript"},
  {".json", "application/json"},
  {".png",  "image/png"},
  {".jpg",  "image/jpg"},
  {"", ""}
};



//<<Pin Hookup>>//
//19  ::  MISO    
//23  ::  MOSI
//18  ::  SCK

//15  ::  SD_CS

//27  ::  LCD_DC
//33  ::  LCD_RESET
//5   ::  LCD_CS
//22  ::  LCD_Backlight

#define TFT_BRIGHTNESS 200
#define SCK 18
#define MOSI 23
#define MISO 19
//#define SS 15
#define TFT_BL 22

#define SD_CS 21
#define LCD_DC_A0 27
#define LCD_RESET 33
#define LCD_CS 5

#define TOUCH_CS  15

Arduino_DataBus *bus = new Arduino_HWSPI(LCD_DC_A0, LCD_CS, SCK, MOSI, MISO);
Arduino_GFX *gfx = new Arduino_ILI9341(bus, LCD_RESET, 0 /* rotation */, false /* IPS */);

static MjpegClass mjpeg;
uint8_t *mjpeg_buf;

/* variables */
static unsigned long start_ms, curr_ms, next_frame_ms, touch_start_ms, touch_current_ms;
static int next_frame;

bool playVideo = false;

String wifiQR;
bool printedSecondQR = false;

bool videoFileFound = false;

XPT2046_Touchscreen ts(TOUCH_CS);

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


const byte DNS_PORT = 53;
DNSServer dnsServer;

const String webName = "jframe.cam";

// We declare a function that will be the entry-point for the task that is going to be
// created.
void serverTask(void *params);



//////////Setup
void setupLCD(){
  Serial.println(("Setting up LCD"));
  gfx->begin();
  gfx->displayOn();

  ledcAttachPin(TFT_BL, 1);     // assign TFT_BL pin to channel 1
  ledcSetup(1, 12000, 8);       // 12 kHz PWM, 8-bit resolution
  ledcWrite(1, TFT_BRIGHTNESS); // brightness 0 - 255

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
  ledcDetachPin(TFT_BL);
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
  Serial.printf("Requested: %s Content Type: %s", fileName, contentType);
  Serial.println();
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

//Page Requests
void getffmpeg(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/ffmpeg.min.js", "text/javascript", false);
}

void handleRoot(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/index.html", "text/html", false);
}

void handleUpdatePage(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/uploadSpiffs.html", "text/html", false);
}

void handleCSSBundle(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/bundle.css", "text/css", false);
}

void handleJSBundle(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/bundle.js", "text/javascript", false);
}

void handleJSMap(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/bundle.js.map", "text/javascript", false);
}

void handleGlobalCSS(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/global.css", "text/css", false);
}

void handleManifest(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/manifest.json", "application/json", false);
}

void handleServiceWorker(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/service-worker.js", "text/javascript", false);
}

void handleFFmpegWASM(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/ffmpeg-core.wasm", "application/wasm", true);
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

    File file = SPIFFS.open(filename.c_str());

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
  insecureServer = new HTTPServer();

  Serial.println("Setting up WiFi");
  WiFi.softAP(WIFI_SSID, WIFI_PSK);
  Serial.print("Connected. IP=");
  Serial.println(WiFi.softAPIP());
  wifiQR = "";
  wifiQR = wifiQR + "https://" + WiFi.softAPIP().toString().c_str() + "/";

  // For every resource available on the server, we need to create a ResourceNode
  // The ResourceNode links URL and HTTP method to a handler function
  ResourceNode * node404     = new ResourceNode("", "GET", &handle404);
  ResourceNode * nodeRoot    = new ResourceNode("/", "GET", &handleRoot);
  ResourceNode * nodeUploadPage    = new ResourceNode("/updatePage", "GET", &handleUpdatePage);
  ResourceNode * nodeFFMPEG = new ResourceNode("/ffmpeg.min.js", "GET", &getffmpeg);

  // ResourceNode * nodeBundleCSS = new ResourceNode("/bundle.css", "GET", &handleCSSBundle);
  // ResourceNode * nodeBundleJS = new ResourceNode("/bundle.js", "GET", &handleJSBundle);
  // ResourceNode * nodeBundleJSMap = new ResourceNode("/bundle.js.map", "GET", &handleJSMap);
  // ResourceNode * nodeGlobalCSS = new ResourceNode("/global.css", "GET", &handleGlobalCSS);
  // ResourceNode * nodeManifest = new ResourceNode("/manifest.json", "GET", &handleManifest);
  // ResourceNode * nodeServiceWorker = new ResourceNode("/service-worker.js", "GET", &handleServiceWorker);
  ResourceNode * nodeFFmpegWASM = new ResourceNode("/ffmpeg-core.wasm", "GET", &handleFFmpegWASM);
  
  ResourceNode * nodeUpload = new ResourceNode("/upload", "POST", &handleVideoUpload);
  ResourceNode * updateSpiffs = new ResourceNode("/updateSpiffs", "POST", &handleSpiffsUpload);
  ResourceNode * updateFirmware = new ResourceNode("/updateFirmware", "POST", &handleFirmwareUpload);

  ResourceNode * nodeRedirect = new ResourceNode("/", "GET", &handleRedirect);
  ResourceNode * nodeRedirect404 = new ResourceNode("", "GET", &handleRedirect);

  // We register the SPIFFS handler as the default node, so every request that does
  // not hit any other node will be redirected to the file system.
  ResourceNode * spiffsNode = new ResourceNode("", "", &handleSPIFFS);
  secureServer->setDefaultNode(spiffsNode);

  secureServer->registerNode(nodeRoot);
  //secureServer->setDefaultNode(node404);
  secureServer->registerNode(nodeUploadPage);
  secureServer->registerNode(nodeUpload);
  //secureServer->registerNode(nodeFFMPEG);
  secureServer->registerNode(updateSpiffs);
  secureServer->registerNode(updateFirmware);

  // secureServer->registerNode(nodeBundleCSS);
  // secureServer->registerNode(nodeBundleJS);
  // secureServer->registerNode(nodeBundleJSMap);
  // secureServer->registerNode(nodeGlobalCSS);
  // secureServer->registerNode(nodeManifest);
  // secureServer->registerNode(nodeServiceWorker);

  secureServer->registerNode(nodeFFmpegWASM);

  insecureServer->registerNode(nodeRedirect);
  insecureServer->registerNode(nodeRedirect404);

  //setting DNS
  dnsServer.start(DNS_PORT, "jframe.cam", WiFi.softAPIP());


  Serial.println("Starting server...");
  secureServer->start();
  //insecureServer->start();
  //if (secureServer->isRunning() && insecureServer->isRunning()) {
  if (secureServer->isRunning() ) {
    Serial.println("Server ready.");
  }


}

void serverTask(void *params) {
  SSLCert cert = SSLCert(example_crt_DER, example_crt_DER_len, example_key_DER, example_key_DER_len);
  secureServer = new HTTPSServer(&cert);
  insecureServer = new HTTPServer();

  Serial.println("Setting up WiFi");
  WiFi.softAP(WIFI_SSID, WIFI_PSK);
  Serial.print("Connected. IP=");
  Serial.println(WiFi.softAPIP());
  wifiQR = "";
  wifiQR = wifiQR + "https://" + WiFi.softAPIP().toString().c_str() + "/";
  // In the separate task we first do everything that we would have done in the
  // setup() function, if we would run the server synchronously.

  // Note: The second task has its own stack, so you need to think about where
  // you create the server's resources and how to make sure that the server
  // can access everything it needs to access. Also make sure that concurrent
  // access is no problem in your sketch or implement countermeasures like locks
  // or mutexes.

    // For every resource available on the server, we need to create a ResourceNode
  // The ResourceNode links URL and HTTP method to a handler function
  ResourceNode * node404     = new ResourceNode("", "GET", &handle404);
  ResourceNode * nodeRoot    = new ResourceNode("/", "GET", &handleRoot);
  ResourceNode * nodeUploadPage    = new ResourceNode("/updatePage", "GET", &handleUpdatePage);
  ResourceNode * nodeFFMPEG = new ResourceNode("/ffmpeg.min.js", "GET", &getffmpeg);

  // ResourceNode * nodeBundleCSS = new ResourceNode("/bundle.css", "GET", &handleCSSBundle);
  // ResourceNode * nodeBundleJS = new ResourceNode("/bundle.js", "GET", &handleJSBundle);
  // ResourceNode * nodeBundleJSMap = new ResourceNode("/bundle.js.map", "GET", &handleJSMap);
  // ResourceNode * nodeGlobalCSS = new ResourceNode("/global.css", "GET", &handleGlobalCSS);
  // ResourceNode * nodeManifest = new ResourceNode("/manifest.json", "GET", &handleManifest);
  // ResourceNode * nodeServiceWorker = new ResourceNode("/service-worker.js", "GET", &handleServiceWorker);
  
  ResourceNode * nodeUpload = new ResourceNode("/upload", "POST", &handleVideoUpload);
  ResourceNode * updateSpiffs = new ResourceNode("/updateSpiffs", "POST", &handleSpiffsUpload);
  ResourceNode * updateFirmware = new ResourceNode("/updateFirmware", "POST", &handleFirmwareUpload);

  // We register the SPIFFS handler as the default node, so every request that does
  // not hit any other node will be redirected to the file system.
  ResourceNode * spiffsNode = new ResourceNode("", "", &handleSPIFFS);
  secureServer->setDefaultNode(spiffsNode);

  secureServer->registerNode(nodeRoot);
  //secureServer->setDefaultNode(node404);
  secureServer->registerNode(nodeUploadPage);
  secureServer->registerNode(nodeUpload);
  //secureServer->registerNode(nodeFFMPEG);
  secureServer->registerNode(updateSpiffs);
  secureServer->registerNode(updateFirmware);

  // secureServer->registerNode(nodeBundleCSS);
  // secureServer->registerNode(nodeBundleJS);
  // secureServer->registerNode(nodeBundleJSMap);
  // secureServer->registerNode(nodeGlobalCSS);
  // secureServer->registerNode(nodeManifest);
  // secureServer->registerNode(nodeServiceWorker);



  //setting DNS
  dnsServer.start(DNS_PORT, "jframe.cam", WiFi.softAPIP());


  Serial.println("Starting server...");
  secureServer->start();
  if (secureServer->isRunning()) {
    Serial.println("Server ready.");

    // "loop()" function of the separate task
    while(true) {
      // This call will let the server do its work
      secureServer->loop();

      // Other code would go here...
      delay(1);
    }
  }
}

void drawWifiQR(){
  //setupServer();
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

  xTaskCreatePinnedToCore(serverTask, "https443", 6144, NULL, 1, NULL, ARDUINO_RUNNING_CORE);
}



void loop()
{
  if(!videoFileFound){
    //insecureServer->loop();
    //secureServer->loop();
    dnsServer.processNextRequest();
    if(WiFi.softAPgetStationNum() > 0 && !printedSecondQR){
      drawQRCode(wifiQR ,"Step 2");
      printedSecondQR = true;
    }
  }
  
  if(playVideo){
    videoLoop();
  }

  delay(1);
}
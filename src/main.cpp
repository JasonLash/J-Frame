#define MJPEG_FILENAME "/pleaseworkvideo.mjpeg"
#define FPS 15
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
#include <HTTPBodyParser.hpp>
#include <HTTPMultipartBodyParser.hpp>
#include <HTTPURLEncodedBodyParser.hpp>
#include "MjpegClass.h"

#include "cert.h"
#include "private_key.h"


using namespace httpsserver;

//#define WIFI_SSID "J and L"
#define WIFI_SSID "FRAME"
#define WIFI_PSK  "thankyoufortheinternet"


HTTPSServer * secureServer;

void handleRoot(HTTPRequest * req, HTTPResponse * res);
void handle404(HTTPRequest * req, HTTPResponse * res);
void uploadFile(HTTPRequest * req, HTTPResponse * res);
void uploadSpiffs(HTTPRequest * req, HTTPResponse * res);
void getffmpeg(HTTPRequest * req, HTTPResponse * res);

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
static int skipped_frames, next_frame;

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

  Serial.println(F("PCM audio MJPEG video start"));

  // init Video
  mjpeg.setup(&vFile, mjpeg_buf, drawMCU, false, true);
  //mjpeg.setup(&vFile, mjpeg_buf, drawMCU, true /* useBigEndian */, 0 /* x */, 0 /* y */, gfx->width() /* widthLimit */, gfx->height() /* heightLimit */);
  //mjpeg.setup(vFile, mjpeg_buf, (Arduino_TFT *)gfx, true);


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
        // Serial.print("Pressure = ");
        // Serial.print(p.z);
        // Serial.print(", x = ");
        // Serial.print(p.x);
        // Serial.print(", y = ");
        // Serial.print(p.y);
        // Serial.println();
        int touchWH = 3900;
        int mapedX = map(p.x, 250, touchWH, 240, 0);;
        int mapedY = map(p.y, 250, touchWH, 320, 0);;
        // Serial.print(", x = ");
        // Serial.print(mapedX);
        // Serial.print(", y = ");
        // Serial.print(mapedY);
        // Serial.println();
        Serial.println(checkIfInRect(resetFrameButton.x, resetFrameButton.y, resetFrameButton.width, resetFrameButton.height, p.x, p.y));
        if(checkIfInRect(resetFrameButton.x, resetFrameButton.y, resetFrameButton.width, resetFrameButton.height, mapedX, mapedY)){
          //drawWifiQR();
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



    if (ts.touched()) {
      //Serial.println(millis() - touch_start_ms);
      if(millis() - touch_current_ms < 200){
        touch_current_ms = millis();
      } else {
        touch_start_ms = millis();
      }

      if(millis() - touch_start_ms > 1000){
        touch_current_ms = millis();
        touch_start_ms = millis();
        pauseVideo = true;
        
        //Serial.println(pauseVideo);
      }

      if(millis() - touch_current_ms > 2000){
        touch_current_ms = millis();
        touch_start_ms = millis();
      }
      
    }

    if (millis() < next_frame_ms) // check show frame or skip frame
    {

      // Play video
      mjpeg.drawJpg();
    }
    else
    {
      ++skipped_frames;
      //Serial.println(F("Skip frame"));
    }
    curr_ms = millis();

    while (millis() < next_frame_ms)
    {
      
      vTaskDelay(1);
    }

    curr_ms = millis();
    next_frame_ms = start_ms + (++next_frame * 1000 / FPS);
  }
  Serial.println(F("PCM audio MJPEG video end"));
  vFile.close();

  Serial.println(F("Going to sleep"));
  ledcDetachPin(TFT_BL);
  gfx->displayOff();
  
  esp_deep_sleep_start();

  //delay(10000);
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
    Serial.printf("handleFormUpload: field name='%s', filename='%s', mimetype='%s'\n", name.c_str(), filename.c_str(), mimeType.c_str());
    
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

void simpleRequest(HTTPRequest * req, HTTPResponse * res, String fileName, String contentType){
  Serial.printf("Requested: %s Content Type: %s", fileName, contentType);
  res->setHeader("Content-Type", contentType.c_str());
  res->setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res->setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  File file = SPIFFS.open(fileName, "r");
    
  uint8_t buffer[256];
  size_t length = 0;
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
  simpleRequest(req, res, "/ffmpeg.min.js", "text/javascript");
}


void handleRoot(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/index.html", "text/html");
}

void handleUpdatePage(HTTPRequest * req, HTTPResponse * res) {
  simpleRequest(req, res, "/uploadSpiffs.html", "text/html");
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


void setupServer(){


  // File certFile = SPIFFS.open("/cert.txt");
  // File certLENFile = SPIFFS.open("/certLEN.txt");
  // File pKeyFile = SPIFFS.open("/key.txt");
  // File pKeyLENFile = SPIFFS.open("/keyLEN.txt");
  // if (!certFile || certFile.isDirectory() || !pKeyFile || pKeyFile.isDirectory() || true)
  // {
  //   Serial.println("No certs Found");
  //   Serial.println("Creating a new self-signed certificate.");
  //   Serial.println("This may take up to a minute, so be patient ;-)");

  //   SSLCert * cert = new SSLCert();

  //   int createCertResult = createSelfSignedCert(
  //     *cert,
  //     KEYSIZE_2048,
  //     "CN=myesp32.local,O=FancyCompany,C=US",
  //     "20190101000000",
  //     "20300101000000"
  //   );


  //   if (createCertResult != 0) {
  //     Serial.printf("Cerating certificate failed. Error Code = 0x%02X, check SSLCert.hpp for details", createCertResult);
  //     while(true) delay(500);
  //   }
  //   Serial.println("Creating the certificate was successful");

  //   certFile.close();
  //   certLENFile.close();
  //   pKeyFile.close();
  //   pKeyLENFile.close();

  //   certFile = SPIFFS.open("/cert.txt", FILE_WRITE);
  //   certLENFile = SPIFFS.open("/certLEN.txt", FILE_WRITE);
  //   pKeyFile = SPIFFS.open("/key.txt", FILE_WRITE);
  //   pKeyLENFile = SPIFFS.open("/keyLEN.txt", FILE_WRITE);

  //   certFile.write(*cert->getCertData());
  //   //certLENFile.write(cert->getCertLength());


  //   certFile.close();

  //   File cert32323 = SPIFFS.open("/cert.txt", FILE_READ);

  //   ..unsigned char certData3 = cert32323.read();

  //   byte image[IMAGE_SIZE];
  //   char buffer[20];
  //   int index = 0;

  //   while (file.available())
  //   {
  //     int count = file.readBytesUntil(buffer, ',');
  //     buffer[count] = '\0'; // Add null terminator
  //     image[index++] = strtoul(buffer, 0); // Convert hex constant to binary
  //   }


  //   if(certData3 == *cert->getCertData()){
  //     Serial.print("SETSTTSSTSTSTSTSTSTSTTSTST");
  //   }
  //   // pKeyFile.write(*cert->getPKData());
  //   // pKeyLENFile.write(cert->getPKLength());


    
  //   // unsigned int certLength = certLENFile.read();
  //   // unsigned char certData[] = new unsigned char[certLength]();
  //   // certData = certFile.read();
    
  //   // unsigned char keyData[] = pKeyFile.read();
  //   // unsigned int keyLength = certLENFile.read();

  //   // SSLCert cert2 = SSLCert(&certData, certLength, &keyData, keyLength);
  //   // secureServer = new HTTPSServer(&cert2);


  //   SSLCert cert2 = SSLCert(cert->getCertData(), cert->getCertLength(), cert->getPKData(), cert->getPKLength());
  //   secureServer = new HTTPSServer(&cert2);


  //   //secureServer = new HTTPSServer(cert);
  //   //save cert here
  // }else {
  //   //load cert here

  //   unsigned char certData = certFile.read();
  //   unsigned int certLength = certLENFile.read();
  //   unsigned char keyData = pKeyFile.read();
  //   unsigned int keyLength = pKeyLENFile.read();

  //   //     String newString = "";
  //   // if (certLENFile) {
  //   // while (certLENFile.available()) {
  //   //   char ch = certLENFile.read(); // read characters one by one from Micro SD Card
  //   //   //Serial.print(ch); // print the character to Serial Monitor
  //   //   newString += ch;
  //   // }
  //   // Serial.println(newString); 
  //   //}
  //   //unsigned int iStart=atoi(newString.c_str());


  //   SSLCert cert = SSLCert(&certData, certLength, &keyData, keyLength);
  //   secureServer = new HTTPSServer(&cert);

  // }

  //   certFile.close();
  //   certLENFile.close();
  //   pKeyFile.close();
  //   pKeyLENFile.close();



  // If you're working on a serious project, this would be a good place to initialize some form of non-volatile storage
  // and to put the certificate and the key there. This has the advantage that the certificate stays the same after a reboot
  // so your client still trusts your server, additionally you increase the speed-up of your application.
  // Some browsers like Firefox might even reject the second run for the same issuer name (the distinguished name defined above).
  //
  // Storing:
  //   For the key:
  //     cert->getPKLength() will return the length of the private key in byte
  //     cert->getPKData() will return the actual private key (in DER-format, if that matters to you)
  //   For the certificate:
  //     cert->getCertLength() and ->getCertData() do the same for the actual certificate data.
  // Restoring:
  //   When your applications boots, check your non-volatile storage for an existing certificate, and if you find one
  //   use the parameterized SSLCert constructor to re-create the certificate and pass it to the HTTPSServer.
  //
  // A short reminder on key security: If you're working on something professional, be aware that the storage of the ESP32 is
  // not encrypted in any way. This means that if you just write it to the flash storage, it is easy to extract it if someone
  // gets a hand on your hardware. You should decide if that's a relevant risk for you and apply countermeasures like flash
  // encryption if neccessary

  // We can now use the new certificate to setup our server as usual.
  
  SSLCert cert = SSLCert(example_crt_DER, example_crt_DER_len, example_key_DER, example_key_DER_len);
  secureServer = new HTTPSServer(&cert);

  // Connect to WiFi
  Serial.println("Setting up WiFi");
  //WiFi.begin(WIFI_SSID, WIFI_PSK);
  WiFi.softAP(WIFI_SSID, WIFI_PSK);
  // while (WiFi.status() != WL_CONNECTED) {
  //   Serial.print(".");
  //   delay(500);
  // }
  Serial.print("Connected. IP=");
  Serial.println(WiFi.softAPIP());
  wifiQR = "";
  wifiQR = wifiQR + "https://" + WiFi.softAPIP().toString().c_str() + "/";

  // For every resource available on the server, we need to create a ResourceNode
  // The ResourceNode links URL and HTTP method to a handler function
  ResourceNode * nodeRoot    = new ResourceNode("/", "GET", &handleRoot);
  ResourceNode * nodeUploadPage    = new ResourceNode("/updatePage", "GET", &handleUpdatePage);
  ResourceNode * node404     = new ResourceNode("", "GET", &handle404);

   // And of course we need some way to retrieve the file again. We use the placeholder
  // feature in the path to do so:
  ResourceNode * nodeUpload = new ResourceNode("/upload", "POST", &handleVideoUpload);

  ResourceNode * updateSpiffs = new ResourceNode("/updateSpiffs", "POST", &handleSpiffsUpload);

  ResourceNode * updateFirmware = new ResourceNode("/updateFirmware", "POST", &handleFirmwareUpload);
  
  ResourceNode * nodeJS    = new ResourceNode("/ffmpeg.min.js", "GET", &getffmpeg);


  // Add the root node to the server
  secureServer->registerNode(nodeRoot);
  // Add the 404 not found node to the server.
  secureServer->setDefaultNode(node404);

  secureServer->registerNode(nodeUploadPage);

  secureServer->registerNode(nodeUpload);
  secureServer->registerNode(nodeJS);
  secureServer->registerNode(updateSpiffs);
  secureServer->registerNode(updateFirmware);

  Serial.println("Starting server...");
  secureServer->start();
  if (secureServer->isRunning()) {
    Serial.println("Server ready.");
  }
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
  if(!videoFileFound){
    secureServer->loop();
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
#define MJPEG_FILENAME "/pleaseworkvideo.mjpeg"
#define FPS 15
#define MJPEG_BUFFER_SIZE (320 * 240 * 2 / 4)
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

#include <SSLCert.hpp>
#include <HTTPRequest.hpp>
#include <HTTPResponse.hpp>
#include <esp32/sha.h>
#include <HTTPSServer.hpp>
#include <HTTPBodyParser.hpp>
#include <HTTPMultipartBodyParser.hpp>
#include <HTTPURLEncodedBodyParser.hpp>
#include "MjpegClass.h"


using namespace httpsserver;

//#define WIFI_SSID "J and L"
#define WIFI_SSID "frameTest"
#define WIFI_PSK  "thankyoufortheinternet"
#define DIR_PUBLIC "/public"

SSLCert * cert;
HTTPSServer * secureServer;

void handleRoot(HTTPRequest * req, HTTPResponse * res);
void handle404(HTTPRequest * req, HTTPResponse * res);
void uploadFile(HTTPRequest * req, HTTPResponse * res);
void handleJS(HTTPRequest * req, HTTPResponse * res);

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
#define SS 15
#define TFT_BL 22

#define SD_CS 15
#define LCD_DC_A0 27
#define LCD_RESET 33
#define LCD_CS 5

Arduino_DataBus *bus = new Arduino_HWSPI(LCD_DC_A0, LCD_CS, SCK, MOSI, MISO);
Arduino_GFX *gfx = new Arduino_ILI9341(bus, LCD_RESET, 0 /* rotation */, false /* IPS */);

static MjpegClass mjpeg;
uint8_t *mjpeg_buf;

/* variables */
static unsigned long start_ms, curr_ms, next_frame_ms;
static int skipped_frames, next_frame;

bool playVideo = false;

String wifiQR;
bool printedSecondQR = false;

// pixel drawing callback
static int drawMCU(JPEGDRAW *pDraw)
{
  //Serial.printf("Draw pos = %d,%d. size = %d x %d\n", pDraw->x, pDraw->y, pDraw->iWidth, pDraw->iHeight);
  unsigned long start = millis();
  gfx->draw16bitBeRGBBitmap(pDraw->x, pDraw->y, pDraw->pPixels, pDraw->iWidth, pDraw->iHeight);
  return 1;
}

void setupLCD(){
  Serial.println(("Setting up LCD"));
  gfx->begin();
  gfx->fillScreen(WHITE);

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

  while (vFile.available() && mjpeg.readMjpegBuf()) // Read video
  {
    curr_ms = millis();

    if (millis() < next_frame_ms) // check show frame or skip frame
    {
      // Play video
      mjpeg.drawJpg();
    }
    else
    {
      ++skipped_frames;
      Serial.println(F("Skip frame"));
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

  //delay(10000);
}

void handleFileUpload(HTTPRequest * req, HTTPResponse * res) {
  Serial.printf("trying file upload");
  res->setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res->setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

  // First, we need to check the encoding of the form that we have received.
  // The browser will set the Content-Type request header, so we can use it for that purpose.
  // Then we select the body parser based on the encoding.
  // Actually we do this only for documentary purposes, we know the form is going
  // to be multipart/form-data.
  HTTPBodyParser *parser;
  std::string contentType = req->getHeader("Content-Type");

  // The content type may have additional properties after a semicolon, for exampel:
  // Content-Type: text/html;charset=utf-8
  // Content-Type: multipart/form-data;boundary=------s0m3w31rdch4r4c73rs
  // As we're interested only in the actual mime _type_, we strip everything after the
  // first semicolon, if one exists:
  size_t semicolonPos = contentType.find(";");
  if (semicolonPos != std::string::npos) {
    contentType = contentType.substr(0, semicolonPos);
  }

  // Now, we can decide based on the content type:
  if (contentType == "multipart/form-data") {
    parser = new HTTPMultipartBodyParser(req);
  } else {
    Serial.printf("Unknown POST Content-Type: %s\n", contentType.c_str());
    return;
  }

  res->println("<html><head><title>File Upload</title></head><body><h1>File Upload</h1>");

  // We iterate over the fields. Any field with a filename is uploaded.
  // Note that the BodyParser consumes the request body, meaning that you can iterate over the request's
  // fields only a single time. The reason for this is that it allows you to handle large requests
  // which would not fit into memory.
  bool didwrite = false;

  // parser->nextField() will move the parser to the next field in the request body (field meaning a
  // form field, if you take the HTML perspective). After the last field has been processed, nextField()
  // returns false and the while loop ends.
  while(parser->nextField()) {
    // For Multipart data, each field has three properties:
    // The name ("name" value of the <input> tag)
    // The filename (If it was a <input type="file">, this is the filename on the machine of the
    //   user uploading it)
    // The mime type (It is determined by the client. So do not trust this value and blindly start
    //   parsing files only if the type matches)
    std::string name = parser->getFieldName();
    std::string filename = parser->getFieldFilename();
    std::string mimeType = parser->getFieldMimeType();
    // We log all three values, so that you can observe the upload on the serial monitor:
    Serial.printf("handleFormUpload: field name='%s', filename='%s', mimetype='%s'\n", name.c_str(), filename.c_str(), mimeType.c_str());

    // Double check that it is what we expect
    // if (name != "file") {
    //   Serial.println("Skipping unexpected field");
    //   break;
    // }
    
    // You should check file name validity and all that, but we skip that to make the core
    // concepts of the body parser functionality easier to understand.
    std::string pathname = "/" + filename;

    // Create a new file on spiffs to stream the data into
    File file = SD.open(pathname.c_str(), FILE_WRITE);
    size_t fileLength = 0;
    didwrite = true;

    // With endOfField you can check whether the end of field has been reached or if there's
    // still data pending. With multipart bodies, you cannot know the field size in advance.
    while (!parser->endOfField()) {
      byte buf[512];
      size_t readLength = parser->read(buf, 512);
      file.write(buf, readLength);
      fileLength += readLength;
    }
    file.close();
    res->printf("<p>Saved %d bytes to %s</p>", (int)fileLength, pathname.c_str());
  }
  if (!didwrite) {
    res->println("<p>Did not write any file</p>");
  }else{
    playVideo = true;
  }
  res->println("</body></html>");
  delete parser;
}


void handleJS(HTTPRequest * req, HTTPResponse * res) {
  // Status code is 200 OK by default.
  // We want to deliver a simple HTML page, so we send a corresponding content type:
  Serial.printf("wants JS");
  res->setHeader("Content-Type", "text/javascript");
  res->setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res->setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  File file = SPIFFS.open("/ffmpeg.min.js", "r");
    
  uint8_t buffer[256];
  size_t length = 0;
  do {
      length = file.read(buffer, 256);
      res->write(buffer, length);
  } while (length > 0);

  file.close();
}



void handleRoot(HTTPRequest * req, HTTPResponse * res) {
  // Status code is 200 OK by default.
  // We want to deliver a simple HTML page, so we send a corresponding content type:

  Serial.printf("wants root");
  
  res->setHeader("Content-Type", "text/html");
  res->setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res->setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  File file = SPIFFS.open("/index.html", "r");
  
  uint8_t buffer[256];
  size_t length = 0;
  do {
    length = file.read(buffer, 256);
    res->write(buffer, length);
  } while (length > 0);

  file.close();
  
}


void handle404(HTTPRequest * req, HTTPResponse * res) {
  // Discard request body, if we received any
  // We do this, as this is the default node and may also server POST/PUT requests
  req->discardRequestBody();

  // Set the response status
  res->setStatusCode(404);
  res->setStatusText("Not Found");

  // Set content type of the response
  res->setHeader("Content-Type", "text/html");

  // Write a tiny HTTP page
  res->println("<!DOCTYPE html>");
  res->println("<html>");
  res->println("<head><title>Not Found</title></head>");
  res->println("<body><h1>404 Not Found</h1><p>The requested resource was not found on this server.</p></body>");
  res->println("</html>");
}


void setupServer(){
   // Setup filesystem
  if (!SPIFFS.begin(true)) Serial.println("Mounting SPIFFS failed");

  Serial.println("Creating a new self-signed certificate.");
  Serial.println("This may take up to a minute, so be patient ;-)");

  // First, we create an empty certificate:
  cert = new SSLCert();

  // Now, we use the function createSelfSignedCert to create private key and certificate.
  // The function takes the following paramters:
  // - Key size: 1024 or 2048 bit should be fine here, 4096 on the ESP might be "paranoid mode"
  //   (in generel: shorter key = faster but less secure)
  // - Distinguished name: The name of the host as used in certificates.
  //   If you want to run your own DNS, the part after CN (Common Name) should match the DNS
  //   entry pointing to your ESP32. You can try to insert an IP there, but that's not really good style.
  // - Dates for certificate validity (optional, default is 2019-2029, both included)
  //   Format is YYYYMMDDhhmmss
  int createCertResult = createSelfSignedCert(
    *cert,
    KEYSIZE_2048,
    "CN=myesp32.local,O=FancyCompany,C=DE",
    "20190101000000",
    "20300101000000"
  );

  // Now check if creating that worked
  if (createCertResult != 0) {
    Serial.printf("Cerating certificate failed. Error Code = 0x%02X, check SSLCert.hpp for details", createCertResult);
    while(true) delay(500);
  }
  Serial.println("Creating the certificate was successful");

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
  secureServer = new HTTPSServer(cert);

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
  ResourceNode * node404     = new ResourceNode("", "GET", &handle404);

   // And of course we need some way to retrieve the file again. We use the placeholder
  // feature in the path to do so:
  ResourceNode * nodeUpload = new ResourceNode("/upload", "POST", &handleFileUpload);
  
  ResourceNode * nodeJS    = new ResourceNode("/ffmpeg.min.js", "GET", &handleJS);


  // Add the root node to the server
  secureServer->registerNode(nodeRoot);
  // Add the 404 not found node to the server.
  secureServer->setDefaultNode(node404);

  secureServer->registerNode(nodeUpload);
  secureServer->registerNode(nodeJS);

  Serial.println("Starting server...");
  secureServer->start();
  if (secureServer->isRunning()) {
    Serial.println("Server ready.");
  }
}

void drawQRCode(String inputString, String stepString){
  gfx->fillScreen(WHITE);
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  char Buf[inputString.length()];
  inputString.toCharArray(Buf, inputString.length());
  qrcode_initText(&qrcode, qrcodeData, 3, 0, Buf);

  

  int QRxBegin = 100;
  int QRyBegin = 70;
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

  gfx->setCursor(130, 10);
  gfx->setTextSize(2);
  gfx->setTextColor(BLACK);
  gfx->println(stepString);


  gfx->setCursor(130, 30);
  gfx->setTextSize(3);
  gfx->setTextColor(BLACK);
  gfx->println("SCAN");
}



void setup()
{
  Serial.begin(115200);
  setupLCD();
  setupSD();
  setupServer();

  String wifiQR = "";
  wifiQR = wifiQR + "WIFI:S:" + WIFI_SSID + ";T:WPA;P:" + WIFI_PSK + ";;";
  drawQRCode(wifiQR, "Step 1");
}



void loop()
{
  // This call will let the server do its work
  secureServer->loop();
  if(WiFi.softAPgetStationNum() > 0 && !printedSecondQR){
    Serial.println("printing QR");
    drawQRCode(wifiQR ,"Step 2");
    printedSecondQR = true;
  }

  if(playVideo){
    videoLoop();
  }
  // Other code would go here...
  delay(1);
  
  
}


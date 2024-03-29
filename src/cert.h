#ifndef CERT_H_
#define CERT_H_
unsigned char example_crt_DER[] = {
  0x30, 0x82, 0x04, 0x4f, 0x30, 0x82, 0x03, 0x37, 0xa0, 0x03, 0x02, 0x01,
  0x02, 0x02, 0x12, 0x03, 0x94, 0x52, 0x84, 0x9a, 0x21, 0x40, 0xc7, 0xe4,
  0x87, 0x2b, 0x64, 0x8a, 0xef, 0xa2, 0x51, 0x67, 0x66, 0x30, 0x0d, 0x06,
  0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00,
  0x30, 0x32, 0x31, 0x0b, 0x30, 0x09, 0x06, 0x03, 0x55, 0x04, 0x06, 0x13,
  0x02, 0x55, 0x53, 0x31, 0x16, 0x30, 0x14, 0x06, 0x03, 0x55, 0x04, 0x0a,
  0x13, 0x0d, 0x4c, 0x65, 0x74, 0x27, 0x73, 0x20, 0x45, 0x6e, 0x63, 0x72,
  0x79, 0x70, 0x74, 0x31, 0x0b, 0x30, 0x09, 0x06, 0x03, 0x55, 0x04, 0x03,
  0x13, 0x02, 0x52, 0x33, 0x30, 0x1e, 0x17, 0x0d, 0x32, 0x33, 0x30, 0x32,
  0x31, 0x33, 0x32, 0x32, 0x32, 0x34, 0x32, 0x33, 0x5a, 0x17, 0x0d, 0x32,
  0x33, 0x30, 0x35, 0x31, 0x34, 0x32, 0x32, 0x32, 0x34, 0x32, 0x32, 0x5a,
  0x30, 0x15, 0x31, 0x13, 0x30, 0x11, 0x06, 0x03, 0x55, 0x04, 0x03, 0x13,
  0x0a, 0x6a, 0x66, 0x72, 0x61, 0x6d, 0x65, 0x2e, 0x63, 0x61, 0x6d, 0x30,
  0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42,
  0x00, 0x04, 0xcc, 0xce, 0xe2, 0x82, 0xc3, 0x87, 0xf6, 0x3d, 0xdb, 0x2e,
  0xff, 0xdb, 0x9c, 0x84, 0xdc, 0x52, 0x1b, 0xb1, 0xd6, 0xc9, 0x75, 0xfe,
  0x54, 0x95, 0xc0, 0x51, 0x3a, 0x86, 0x5c, 0x3e, 0xae, 0xb3, 0x19, 0x95,
  0x43, 0x04, 0x34, 0xde, 0xd7, 0xd3, 0x19, 0xdc, 0xa7, 0xc6, 0x9f, 0xd0,
  0xe3, 0x1b, 0x51, 0x59, 0xd4, 0xb6, 0x55, 0x01, 0xd0, 0xa6, 0xd5, 0x8e,
  0x29, 0xdf, 0x30, 0x45, 0x17, 0xee, 0xa3, 0x82, 0x02, 0x45, 0x30, 0x82,
  0x02, 0x41, 0x30, 0x0e, 0x06, 0x03, 0x55, 0x1d, 0x0f, 0x01, 0x01, 0xff,
  0x04, 0x04, 0x03, 0x02, 0x07, 0x80, 0x30, 0x1d, 0x06, 0x03, 0x55, 0x1d,
  0x25, 0x04, 0x16, 0x30, 0x14, 0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05,
  0x07, 0x03, 0x01, 0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03,
  0x02, 0x30, 0x0c, 0x06, 0x03, 0x55, 0x1d, 0x13, 0x01, 0x01, 0xff, 0x04,
  0x02, 0x30, 0x00, 0x30, 0x1d, 0x06, 0x03, 0x55, 0x1d, 0x0e, 0x04, 0x16,
  0x04, 0x14, 0xf8, 0x14, 0x30, 0xc5, 0xa9, 0x7a, 0x51, 0xaa, 0x60, 0xff,
  0xd2, 0x33, 0xbc, 0x0d, 0x99, 0x77, 0xfc, 0xe3, 0x42, 0x2c, 0x30, 0x1f,
  0x06, 0x03, 0x55, 0x1d, 0x23, 0x04, 0x18, 0x30, 0x16, 0x80, 0x14, 0x14,
  0x2e, 0xb3, 0x17, 0xb7, 0x58, 0x56, 0xcb, 0xae, 0x50, 0x09, 0x40, 0xe6,
  0x1f, 0xaf, 0x9d, 0x8b, 0x14, 0xc2, 0xc6, 0x30, 0x55, 0x06, 0x08, 0x2b,
  0x06, 0x01, 0x05, 0x05, 0x07, 0x01, 0x01, 0x04, 0x49, 0x30, 0x47, 0x30,
  0x21, 0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x01, 0x86,
  0x15, 0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f, 0x2f, 0x72, 0x33, 0x2e, 0x6f,
  0x2e, 0x6c, 0x65, 0x6e, 0x63, 0x72, 0x2e, 0x6f, 0x72, 0x67, 0x30, 0x22,
  0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30, 0x02, 0x86, 0x16,
  0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f, 0x2f, 0x72, 0x33, 0x2e, 0x69, 0x2e,
  0x6c, 0x65, 0x6e, 0x63, 0x72, 0x2e, 0x6f, 0x72, 0x67, 0x2f, 0x30, 0x15,
  0x06, 0x03, 0x55, 0x1d, 0x11, 0x04, 0x0e, 0x30, 0x0c, 0x82, 0x0a, 0x6a,
  0x66, 0x72, 0x61, 0x6d, 0x65, 0x2e, 0x63, 0x61, 0x6d, 0x30, 0x4c, 0x06,
  0x03, 0x55, 0x1d, 0x20, 0x04, 0x45, 0x30, 0x43, 0x30, 0x08, 0x06, 0x06,
  0x67, 0x81, 0x0c, 0x01, 0x02, 0x01, 0x30, 0x37, 0x06, 0x0b, 0x2b, 0x06,
  0x01, 0x04, 0x01, 0x82, 0xdf, 0x13, 0x01, 0x01, 0x01, 0x30, 0x28, 0x30,
  0x26, 0x06, 0x08, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x07, 0x02, 0x01, 0x16,
  0x1a, 0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f, 0x2f, 0x63, 0x70, 0x73, 0x2e,
  0x6c, 0x65, 0x74, 0x73, 0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x2e,
  0x6f, 0x72, 0x67, 0x30, 0x82, 0x01, 0x04, 0x06, 0x0a, 0x2b, 0x06, 0x01,
  0x04, 0x01, 0xd6, 0x79, 0x02, 0x04, 0x02, 0x04, 0x81, 0xf5, 0x04, 0x81,
  0xf2, 0x00, 0xf0, 0x00, 0x76, 0x00, 0xb7, 0x3e, 0xfb, 0x24, 0xdf, 0x9c,
  0x4d, 0xba, 0x75, 0xf2, 0x39, 0xc5, 0xba, 0x58, 0xf4, 0x6c, 0x5d, 0xfc,
  0x42, 0xcf, 0x7a, 0x9f, 0x35, 0xc4, 0x9e, 0x1d, 0x09, 0x81, 0x25, 0xed,
  0xb4, 0x99, 0x00, 0x00, 0x01, 0x86, 0x4d, 0x17, 0xfd, 0x8c, 0x00, 0x00,
  0x04, 0x03, 0x00, 0x47, 0x30, 0x45, 0x02, 0x21, 0x00, 0x9d, 0xc7, 0x43,
  0xf5, 0x29, 0xe1, 0xae, 0x47, 0x0f, 0x93, 0xf5, 0x59, 0x63, 0x5e, 0x2a,
  0xf1, 0x79, 0x32, 0x8b, 0x1d, 0x70, 0x2c, 0xc4, 0xc7, 0x67, 0xea, 0x81,
  0x29, 0x44, 0x21, 0x12, 0x16, 0x02, 0x20, 0x25, 0x7b, 0x78, 0x8c, 0x13,
  0xc6, 0x0c, 0x0f, 0x62, 0x0d, 0x61, 0xbb, 0xd0, 0x92, 0x2a, 0x29, 0xf5,
  0x59, 0x49, 0x5a, 0x44, 0xca, 0x61, 0x24, 0x79, 0x90, 0x8a, 0xbe, 0x65,
  0x29, 0x78, 0xac, 0x00, 0x76, 0x00, 0xe8, 0x3e, 0xd0, 0xda, 0x3e, 0xf5,
  0x06, 0x35, 0x32, 0xe7, 0x57, 0x28, 0xbc, 0x89, 0x6b, 0xc9, 0x03, 0xd3,
  0xcb, 0xd1, 0x11, 0x6b, 0xec, 0xeb, 0x69, 0xe1, 0x77, 0x7d, 0x6d, 0x06,
  0xbd, 0x6e, 0x00, 0x00, 0x01, 0x86, 0x4d, 0x17, 0xfd, 0x95, 0x00, 0x00,
  0x04, 0x03, 0x00, 0x47, 0x30, 0x45, 0x02, 0x20, 0x35, 0x27, 0x4f, 0xbb,
  0x98, 0xa3, 0x4f, 0x03, 0x42, 0xa0, 0xc7, 0x18, 0x61, 0x73, 0x5c, 0x9c,
  0x50, 0xd1, 0x5b, 0xf7, 0x1d, 0xbd, 0xc4, 0x57, 0x2f, 0xf8, 0x8c, 0xed,
  0xc8, 0x17, 0x51, 0xbb, 0x02, 0x21, 0x00, 0xc6, 0xda, 0x9f, 0x38, 0x78,
  0x8e, 0x9e, 0xf5, 0x6d, 0x59, 0x91, 0xbe, 0xe2, 0x7d, 0x85, 0x2f, 0x0f,
  0xb3, 0x5e, 0x50, 0x9a, 0xd8, 0x78, 0x9f, 0x2a, 0xb9, 0xb9, 0xac, 0xec,
  0x59, 0xe6, 0x33, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7,
  0x0d, 0x01, 0x01, 0x0b, 0x05, 0x00, 0x03, 0x82, 0x01, 0x01, 0x00, 0x80,
  0x3e, 0x87, 0x46, 0xb8, 0x51, 0x6a, 0xb6, 0x4c, 0xd1, 0x1a, 0xb7, 0x87,
  0x40, 0xb8, 0x8f, 0xee, 0x1f, 0xd4, 0xd9, 0x87, 0x50, 0xf6, 0x20, 0xad,
  0xc5, 0x9f, 0xbd, 0x5c, 0x81, 0x1f, 0x8e, 0x2d, 0x41, 0xe7, 0x20, 0xf1,
  0x6c, 0x7a, 0x7e, 0x68, 0xbd, 0x14, 0xb7, 0xc8, 0x38, 0x65, 0x09, 0xc7,
  0x4e, 0x42, 0x6a, 0x68, 0x36, 0xd3, 0x8e, 0xcc, 0x3a, 0x99, 0x09, 0x81,
  0x20, 0x58, 0xa4, 0x39, 0x39, 0xbd, 0xab, 0x78, 0x3f, 0xec, 0x2d, 0x71,
  0x9e, 0x90, 0xd5, 0x0f, 0xd7, 0x92, 0x8d, 0x2e, 0x29, 0xf6, 0x5c, 0x06,
  0x9c, 0xb9, 0xd1, 0xd8, 0x2e, 0x67, 0x64, 0xec, 0x84, 0x30, 0x9d, 0xbc,
  0x7f, 0x68, 0x9c, 0x57, 0xc0, 0x52, 0xd9, 0x62, 0xc1, 0x4b, 0x4a, 0xc4,
  0x96, 0xc5, 0xb5, 0xd9, 0xf1, 0x11, 0xe1, 0xb3, 0x20, 0xfc, 0xec, 0x3a,
  0xb6, 0x4b, 0x89, 0xe6, 0x55, 0xd0, 0x19, 0xec, 0x92, 0xe9, 0x00, 0x4a,
  0xf5, 0xa0, 0xea, 0x01, 0xf9, 0xfa, 0xcb, 0xac, 0x8d, 0x74, 0xbb, 0x90,
  0x5e, 0x29, 0x8a, 0xe8, 0xab, 0x8a, 0xc4, 0x7b, 0x42, 0x34, 0x44, 0x53,
  0xa7, 0x76, 0x0a, 0x65, 0xff, 0x70, 0x1c, 0xd7, 0xc6, 0x97, 0xc8, 0x1a,
  0xe6, 0xe8, 0xe5, 0x1e, 0x29, 0xf9, 0x9a, 0x85, 0x8c, 0xf2, 0xdc, 0xe2,
  0x87, 0x7f, 0x2d, 0xfe, 0x29, 0x7c, 0xd1, 0x16, 0x76, 0xc7, 0x3d, 0x07,
  0x02, 0x73, 0x72, 0xcd, 0x11, 0x91, 0x8c, 0xa0, 0xab, 0xdf, 0xae, 0x8f,
  0xfe, 0xf1, 0x02, 0x37, 0x40, 0xcf, 0xfc, 0x08, 0x8d, 0x37, 0xcb, 0x3b,
  0xb8, 0xa2, 0x75, 0x27, 0x2f, 0xf3, 0x3c, 0x0d, 0x90, 0x00, 0x44, 0xa3,
  0x20, 0xad, 0x75, 0x35, 0xa5, 0xa5, 0x5b, 0xaf, 0x92, 0x00, 0xb2, 0xe1,
  0xa7, 0x1e, 0xe8, 0xd7, 0x35, 0xef, 0xe1, 0x59, 0xb5, 0xe9, 0x7f, 0x88,
  0x8a, 0x6e, 0x21
};
unsigned int example_crt_DER_len = 1107;
#endif

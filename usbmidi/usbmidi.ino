#include <Encoder.h>
#include <Bounce.h>

Encoder enc1(0, 1);
Encoder enc1(3, 4);
Encoder enc1(6, 7);
Encoder enc1(9, 10);
Encoder enc1(12, 13);
Encoder enc1(15, 16);

int enc_value1;
int enc_value2;
int enc_value3;
int enc_value4;
int enc_value5;
int enc_value6;

void setup() {
  
}

void loop() {
  enc_value1 = enc1.read();
  if(enc_value1 != 0) {
    delay(1);
    if(enc_value1 < 0) {
      enc_value1 = 0;
      enc1.write(0);
      usbMIDI.sendControlChange(3, 0, 1);
    } else if (enc_value1 > 0) {
      enc_value1 = 0;
      enc1.write(0);
      usbMIDI.sendControlChange(3, 127, 1);
    }
  }

  enc_value2 = enc2.read();
  if(enc_value2 != 0) {
    delay(1);
    if(enc_value2 < 0) {
      enc_value2 = 0;
      enc2.write(0);
      usbMIDI.sendControlChange(3, 0, 2);
    } else if (enc_value2 > 0) {
      enc_value2 = 0;
      enc2.write(0);
      usbMIDI.sendControlChange(3, 127, 2);
    }
  }

  enc_value3 = enc3.read();
  if(enc_value3 != 0) {
    delay(1);
    if(enc_value3 < 0) {
      enc_value3 = 0;
      enc3.write(0);
      usbMIDI.sendControlChange(3, 0, 3);
    } else if (enc_value3 > 0) {
      enc_value3 = 0;
      enc3.write(0);
      usbMIDI.sendControlChange(3, 127, 3);
    }
  }

  enc_value4 = enc4.read();
  if(enc_value4 != 0) {
    delay(1);
    if(enc_value4 < 0) {
      enc_value4 = 0;
      enc4.write(0);
      usbMIDI.sendControlChange(3, 0, 4);
    } else if (enc_value4 > 0) {
      enc_value4 = 0;
      enc4.write(0);
      usbMIDI.sendControlChange(3, 127, 4);
    }
  }

  enc_value5 = enc5.read();
  if(enc_value5 != 0) {
    delay(1);
    if(enc_value5 < 0) {
      enc_value5 = 0;
      enc5.write(0);
      usbMIDI.sendControlChange(3, 0, 5);
    } else if (enc_value5 > 0) {
      enc_value5 = 0;
      enc5.write(0);
      usbMIDI.sendControlChange(3, 127, 5);
    }
  }

  enc_value6 = enc6.read();
  if(enc_value6 != 0) {
    delay(1);
    if(enc_value6 < 0) {
      enc_value6 = 0;
      enc6.write(0);
      usbMIDI.sendControlChange(3, 0, 6);
    } else if (enc_value6 > 0) {
      enc_value6 = 0;
      enc6.write(0);
      usbMIDI.sendControlChange(3, 127, 6);
    }
  }
}

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string>
#include <iostream>
#include <err.h>
#include "e131.hpp"
#include "json.hpp"
#include "utitities.hpp"

using namespace std;

struct channel {
  int id;
  string type;
  int max;
  int min;
  int displayMax;
  int displayMin;
  int defaultVal;
  int dmxAddress;
  int value;
};

struct fixture {
  int id;
  string name;
  string shortName;
  string manufacturer;
  int startDMXAddress;
  vector <channel> channels;
};

struct cue {
  int id;
  string name;
  string description;
  bool active;
  int time;
  vector <fixture> fixtures;
};

int main() {
  vector <fixture> fixtures;
  vector <cue> cues;

  /* Start E1.31 testing */
  int sockfd;
  e131_packet_t packet;
  e131_addr_t dest;

  // create a socket for E1.31
  if ((sockfd = e131_socket()) < 0)
    err(EXIT_FAILURE, "e131_socket");

  // initialize the new E1.31 packet in universe 1 with 24 slots in preview mode
  e131_pkt_init(&packet, 1, 24);
  memcpy(&packet.frame.source_name, "Tonalite Client", 18);
  if (e131_set_option(&packet, E131_OPT_PREVIEW, true) < 0)
    err(EXIT_FAILURE, "e131_set_option");

  // set remote system destination as multicast address
  if (e131_multicast_dest(&dest, 1, E131_DEFAULT_PORT) < 0)
    err(EXIT_FAILURE, "e131_multicast_dest");

  // loop to send cycling levels for each slot
  uint8_t level = 0;
  for (;;) {
    for (size_t pos=0; pos<24; pos++)
      packet.dmp.prop_val[pos + 1] = level;
    level++;
    if (e131_send(sockfd, &packet, &dest) < 0)
      err(EXIT_FAILURE, "e131_send");
    cout << "Frame" << endl;
    //e131_pkt_dump(stderr, &packet);
    packet.frame.seq_number++;
    usleep(250000);
  }
}
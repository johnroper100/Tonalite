var app = require('express')();
var express = require('express');
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var artnetOptions = {
    sendAll: true
}
var artnet = require('artnet')(artnetOptions);

var e131 = require('e131');
var client = new e131.Client('192.168.1.12');
var packet = client.createPacket(512);
var slotsData = packet.getSlotsData();
packet.setSourceName('Tonalite Lighting');
packet.setUniverse(0x01);

app.use(express.static('static'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

var channels = new Array(2048).fill(0);

var u1 = null;
var u2 = null;
var u3 = null;
var u4 = null;
var c = 0;
function dmxLoop() {
    c = 0;
    for (; c < 2048; c++) {
        channels[c] = 0;
    }
    //calculate here
    u1 = channels.slice(0, 512);
    u2 = channels.slice(512, 1024);
    u3 = channels.slice(1024, 1536);
    u4 = channels.slice(1536, 2048);
    packet.setUniverse(0x01);
    slotsData = u1;
    client.send(packet);
    packet.setUniverse(0x02);
    slotsData = u2;
    client.send(packet);
    packet.setUniverse(0x03);
    slotsData = u3;
    client.send(packet);
    packet.setUniverse(0x04);
    slotsData = u4;
    client.send(packet);
    artnet.set(0, 1, u1);
    artnet.set(1, 1, u2);
    artnet.set(2, 1, u3);
    artnet.set(3, 1, u4);
    setTimeout(dmxLoop, 25);
}

io.on('connection', (socket) => {
    console.log('a user connected');
});

dmxLoop();

http.listen(3000, () => {
    console.log('listening on *:3000');
});

if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}

process.on("SIGINT", function () {
    http.close();
    artnet.close();
    process.exit();
});
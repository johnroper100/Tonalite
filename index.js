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

function dmxLoop(){

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
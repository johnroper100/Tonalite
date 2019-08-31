var express = require('express');
var app = express();
var http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');

require.extensions['.jlib'] = require.extensions['.json'];

artnet = require('artnet')({ sendAll: true });

fixtures = [];

http.listen(3000, function () {
    console.log(`Tonalite DMX Lighting Control System`);
});

app.use('/static', express.static(__dirname + '/static'));
app.use('/docs', express.static(__dirname + '/docs/dist'));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/presets', function (req, res) {
    res.sendFile(__dirname + '/presets.html');
});

app.get('/open-source-licenses', function (req, res) {
    res.sendFile(__dirname + '/open-source-licenses.txt');
});

app.get('/showFile', function (req, res) {
    res.download(process.cwd() + '/show.json', moment().format() + '.tonalite', { headers: { 'Content-Disposition': 'attachment', 'Content-Type': 'application/octet-stream' } });
});

io.on('connection', function (socket) {
    console.log(socket);
});
import time
from signal import pause

import socketio
from gpiozero import Button, Led

sio = socketio.Client()

nextBtn = Button(16)
lastBtn = Button(21)
stopRecordBtn = Button(20)
stopRecordLed = Led(4)

nextFixtureBtn = Button(19)
lastFixtureBtn = Button(26)

chan1EncUp = Button(13)
chan1EncDown = Button(12)
chan1Btn = Button(6)

chan2EncUp = Button(5)
chan2EncDown = Button(7)
chan2Btn = Button(8)

chan3EncUp = Button(11)
chan3EncDown = Button(9)
chan3Btn = Button(25)

chan4EncUp = Button(10)
chan4EncDown = Button(24)
chan4Btn = Button(23)

chan5EncUp = Button(22)
chan5EncDown = Button(27)
chan5Btn = Button(18)

chan6EncUp = Button(17)
chan6EncDown = Button(15)
chan6Btn = Button(14)

fixtures = []
currentFixture = 0
currentFixtureChans = {}
singgleFixtureView = False


def sendNextCue():
    sio.emit('nextCue')


def sendLastCue():
    sio.emit('lastCue')


def sendStopCue():
    sio.emit('stopCue')


def sendRecordCue():
    sio.emit('recordCue')


def sendGetNextFixtureChans():
	if currentFixture + 1 == len(fixtures):
		currentFixture = 0
	else:
		currentFixture = currentFixture + 1
    sio.emit('getFixtureParameters', fixtures[currentFixture]['id'])

def sendGetLastFixtureChans():
	if currentFixture == 0:
		currentFixture = len(fixtures) - 1
	else:
		currentFixture = currentFixture - 1
    sio.emit('getFixtureParameters', fixtures[currentFixture]['id'])

lastBtn.when_pressed = sendNextCue
stopRecordBtn.when_pressed = sendStopCue
lastBtn.when_pressed = sendLastCue

nextFixtureBtn.when_pressed = sendGetNextFixtureChans
lastFixtureBtn.when_pressed = sendGetLastFixtureChans

def changeChanValue(chan, direction):
    if direction == 1:
        if currentFixtureChans[chan]['value'] < currentFixtureChans[chan]['max']:
            currentFixtureChans[chan]['value'] = currentFixtureChans[chan]['value'] + 1
    elif direction == -1:
        if currentFixtureChans[chan]['value'] > 0:
            currentFixtureChans[chan]['value'] = currentFixtureChans[chan]['value'] - 1
    sio.emit('changeFixtureParameterValue', {'id': fixtures[currentFixture]['id'], 'pid': chan, 'value': currentFixtureChans[chan]['value']})
    

def chan1EncUpRising():
    if chan1EncUp.is_pressed: changeChanValue(1, -1)
def chan1EncDownRising():
    if chan1EncDown.is_pressed: changeChanValue(1, 1)
chan1EncUp.when_pressed = chan1EncUpRising
chan1EncDown.when_pressed = chan1EncDownRising

def chan2EncUpRising():
    if chan2EncUp.is_pressed: changeChanValue(2, -1)
def chan2EncDownRising():
    if chan2EncDown.is_pressed: changeChanValue(2, 1)
chan2EncUp.when_pressed = chan2EncUpRising
chan2EncDown.when_pressed = chan2EncDownRising

def chan3EncUpRising():
    if chan3EncUp.is_pressed: changeChanValue(3, -1)
def chan3EncDownRising():
    if chan3EncDown.is_pressed: changeChanValue(3, 1)
chan3EncUp.when_pressed = chan3EncUpRising
chan3EncDown.when_pressed = chan3EncDownRising

def chan4EncUpRising():
    if chan4EncUp.is_pressed: changeChanValue(4, -1)
def chan4EncDownRising():
    if chan4EncDown.is_pressed: changeChanValue(4, 1)
chan4EncUp.when_pressed = chan4EncUpRising
chan4EncDown.when_pressed = chan4EncDownRising

def chan5EncUpRising():
    if chan5EncUp.is_pressed: changeChanValue(5, -1)
def chan5EncDownRising():
    if chan5EncDown.is_pressed: changeChanValue(5, 1)
chan5EncUp.when_pressed = chan5EncUpRising
chan5EncDown.when_pressed = chan5EncDownRising

def chan6EncUpRising():
    if chan6EncUp.is_pressed: changeChanValue(6, -1)
def chan6EncDownRising():
    if chan6EncDown.is_pressed: changeChanValue(6, 1)
chan6EncUp.when_pressed = chan6EncUpRising
chan6EncDown.when_pressed = chan6EncDownRising

def changeChanLock(chan):
    sio.emit('changeFixtureParameterLock', {'id': fixtures[currentFixture]['id'], 'pid': chan})

def chan1BtnClick():
    changeChanLock(1)
chan1Btn.when_pressed = chan1BtnClick

def chan2BtnClick():
    changeChanLock(2)
chan2Btn.when_pressed = chan2BtnClick

def chan3BtnClick():
    changeChanLock(3)
chan3Btn.when_pressed = chan3BtnClick

def chan4BtnClick():
    changeChanLock(4)
chan4Btn.when_pressed = chan4BtnClick

def chan5BtnClick():
    changeChanLock(5)
chan5Btn.when_pressed = chan5BtnClick

def chan6BtnClick():
    changeChanLock(6)
chan6Btn.when_pressed = chan6BtnClick

@sio.on('connect')
def on_connect():
    print("connected to server")


@sio.on('fixtures')
def getFixtures(data):
    fixtures = data

@sio.on('fixtureParameters')
def getCurrentFixture(data):
    currentFixtureChans = {'id': data['id'], 'name': data['name'], 'parameters': data['parameters'], 'chips': data['chips']}

@sio.on('cueActionBtn')
def cueActionBtn(data):
    if data == True:
        stopRecordLed.on()
        stopRecordBtn.when_pressed == sendStopCue
    else:
        stopRecordLed.off()
        stopRecordBtn.when_pressed == sendRecordCue


def start_server():
    sio.connect('https://10.166.66.1:3000')
    sio.wait()


if __name__ == '__main__':
    start_server()

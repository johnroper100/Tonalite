import time
from signal import pause

import socketio
from gpiozero import Button, Led

sio = socketio.Client()

nextBtn = Button(16)
lastBtn = Button(21)
stopRecordBtn = Button(20)
stopRecordLed = Led(4)

pageUpBtn = Button(19)
pageDownBtn = Button(26)

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
singleFixtureView = False

currentFixturesPage = 0
currentChannelsPage = 0


def sendNextCue():
    sio.emit('nextCue')


def sendLastCue():
    sio.emit('lastCue')


def sendStopCue():
    sio.emit('stopCue')


def sendRecordCue():
    sio.emit('recordCue')


def pageUp():
    if singleFixtureView:
        currentChannelsPage += 1
    else:
        currentFixturesPage += 1

def pageDown():
    if singleFixtureView:
        if currentChannelsPage > 0:
            currentChannelsPage -= 1
    else:
        if currentFixturesPage > 0:
            currentFixturesPage -= 1

lastBtn.when_pressed = sendNextCue
stopRecordBtn.when_pressed = sendStopCue
lastBtn.when_pressed = sendLastCue

pageUpBtn.when_pressed = pageUp
pageDownBtn.when_pressed = pageDown


def changeChanValue(chan, direction):
    if direction == 1:
        if currentFixtureChans[chan]['value'] < currentFixtureChans[chan]['max']:
            currentFixtureChans[chan]['value'] = currentFixtureChans[chan]['value'] + 1
    elif direction == -1:
        if currentFixtureChans[chan]['value'] > 0:
            currentFixtureChans[chan]['value'] = currentFixtureChans[chan]['value'] - 1
    sio.emit('changeFixtureParameterValue', {
             'id': fixtures[currentFixture]['id'], 'pid': chan, 'value': currentFixtureChans[chan]['value']})


def chan1EncUpRising():
    if chan1EncUp.is_pressed:
        changeChanValue(1, -1)


def chan1EncDownRising():
    if chan1EncDown.is_pressed:
        changeChanValue(1, 1)


chan1EncUp.when_pressed = chan1EncUpRising
chan1EncDown.when_pressed = chan1EncDownRising


def chan1BtnClick():
    changeChanLock(1)


chan1Btn.when_pressed = chan1BtnClick


@sio.on('connect')
def on_connect():
    print("connected to server")


@sio.on('fixtures')
def getFixtures(data):
    fixtures = data


@sio.on('cueActionBtn')
def cueActionBtn(data):
    if data == True:
        stopRecordLed.on()
        stopRecordBtn.when_pressed == sendStopCue
    else:
        stopRecordLed.off()
        stopRecordBtn.when_pressed == sendRecordCue


def start_server():
    sio.connect('http://10.166.66.1:3000')
    sio.wait()


if __name__ == '__main__':
    start_server()

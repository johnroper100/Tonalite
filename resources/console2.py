import time
from signal import pause

import socketio
from gpiozero import Button

sio = socketio.Client()

nextBtn = Button(16)
lastBtn = Button(21)
stopRecordBtn = Button(20)
#stopRecordLed = Led(4)

pageUpBtn = Button(19)
pageDownBtn = Button(26)

chan1EncUp = Button(13,pull_up=True)
chan1EncDown = Button(12,pull_up=True)
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
    global fixtures
    global currentFixture
    print(fixtures[currentFixture]['parameters'][chan]['value'])
    if direction == 1:
        if fixtures[currentFixture]['parameters'][chan]['value'] < fixtures[currentFixture]['parameters'][chan]['max']:
            fixtures[currentFixture]['parameters'][chan]['value'] += 255
    elif direction == -1:
        if fixtures[currentFixture]['parameters'][chan]['value'] > 0:
            fixtures[currentFixture]['parameters'][chan]['value'] -= 255
    sio.emit('changeFixtureParameterValue', {
             'id': fixtures[currentFixture]['id'], 'pid': chan, 'value': fixtures[currentFixture]['parameters'][chan]['value']})


def changeFixtureIntensity(fixture, direction):
    sio.emit('changeFixtureIntensity', {
             'id': fixtures[fixture]['id'], direction: direction})


def chan1EncUpRising():
    if singleFixtureView:
        changeChanValue(6*currentChannelsPage, -1)
    else:
        changeFixtureIntensity(6*currentFixturesPage, -1)


def chan1EncDownRising():
    if singleFixtureView:
        changeChanValue(6*currentChannelsPage, 1)
    else:
        changeFixtureIntensity(6*currentFixturesPage, 1)


chan1EncUp.when_pressed = chan1EncUpRising
chan1EncDown.when_pressed = chan1EncDownRising


def chan2EncUpRising():
    if chan2EncUp.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+1, -1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+1, -1)


def chan2EncDownRising():
    if chan2EncDown.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+1, 1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+1, 1)


chan2EncUp.when_pressed = chan2EncUpRising
chan2EncDown.when_pressed = chan2EncDownRising


def chan3EncUpRising():
    if chan3EncUp.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+2, -1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+2, -1)


def chan3EncDownRising():
    if chan3EncDown.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+2, 1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+2, 1)


chan3EncUp.when_pressed = chan3EncUpRising
chan3EncDown.when_pressed = chan3EncDownRising


def chan4EncUpRising():
    if chan4EncUp.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+3, -1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+3, -1)


def chan4EncDownRising():
    if chan4EncDown.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+3, 1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+3, 1)


chan4EncUp.when_pressed = chan4EncUpRising
chan4EncDown.when_pressed = chan4EncDownRising


def chan5EncUpRising():
    if chan5EncUp.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+4, -1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+4, -1)


def chan5EncDownRising():
    if chan4EncDown.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+4, 1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+4, 1)


chan5EncUp.when_pressed = chan5EncUpRising
chan5EncDown.when_pressed = chan5EncDownRising


def chan6EncUpRising():
    if chan6EncUp.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+5, -1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+5, -1)


def chan6EncDownRising():
    if chan6EncDown.is_pressed:
        if singleFixtureView:
            changeChanValue((6*currentChannelsPage)+5, 1)
        else:
            changeFixtureIntensity((6*currentChannelsPage)+5, 1)


chan6EncUp.when_pressed = chan6EncUpRising
chan6EncDown.when_pressed = chan6EncDownRising


def sendGetFixtureChans(fixture):
    global fixtures
    global currentFixture
    currentFixture = fixture
    global singleFixtureView
    singleFixtureView = True


def changeChanLock(chan):
    global fixtures
    global currentFixture
    sio.emit('changeFixtureParameterLock', {
             'id': fixtures[currentFixture]['id'], 'pid': chan})


def chan1BtnClick():
    global singleFixtureView
    global currentChannelsPage
    global currentFixturesPage
    if singleFixtureView:
        changeChanLock(0)
    else:
        sendGetFixtureChans(6*currentFixturesPage)


chan1Btn.when_pressed = chan1BtnClick


def chan2BtnClick():
    if singleFixtureView:
        changeChanLock((6*currentChannelsPage)+1)
    else:
        sendGetFixtureChans((6*currentFixturesPage)+1)


chan2Btn.when_pressed = chan2BtnClick


def chan3BtnClick():
    if singleFixtureView:
        changeChanLock((6*currentChannelsPage)+2)
    else:
        sendGetFixtureChans((6*currentFixturesPage)+2)


chan3Btn.when_pressed = chan3BtnClick


def chan4BtnClick():
    if singleFixtureView:
        changeChanLock((6*currentChannelsPage)+3)
    else:
        sendGetFixtureChans((6*currentFixturesPage)+3)


chan4Btn.when_pressed = chan4BtnClick


def chan5BtnClick():
    if singleFixtureView:
        changeChanLock((6*currentChannelsPage)+4)
    else:
        sendGetFixtureChans((6*currentFixturesPage)+4)


chan5Btn.when_pressed = chan5BtnClick


def chan6BtnClick():
    if singleFixtureView:
        changeChanLock((6*currentChannelsPage)+5)
    else:
        sendGetFixtureChans((6*currentFixturesPage)+5)


chan6Btn.when_pressed = chan6BtnClick


@sio.on('connect')
def on_connect():
    print("connected to server")


@sio.on('fixtures')
def getFixtures(data):
    global fixtures
    fixtures = data


@sio.on('fixtureParameters')
def getCurrentFixture(data):
    global singleFixtureView
    singleFixtureView = True


@sio.on('cueActionBtn')
def cueActionBtn(data):
    if data == True:
        #stopRecordLed.on()
        stopRecordBtn.when_pressed == sendStopCue
    else:
        #stopRecordLed.off()
        stopRecordBtn.when_pressed == sendRecordCue


def start_server():
    sio.connect('http://192.168.0.113:3000')
    sio.wait()


if __name__ == '__main__':
    start_server()

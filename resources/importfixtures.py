import re
import unicodedata
import json
import os
import colorsys

debugPrint = False

if not os.path.exists(os.path.join("../", "fixtures")):
    os.makedirs(os.path.join("../", "fixtures"))


def get_hsv(hexrgb):
    hexrgb = hexrgb.lstrip("#")   # in case you have Web color specs
    lh = len(hexrgb)
    # Allow short and long hex codes
    r, g, b = (int(hexrgb[i:i+int(lh/3)], 16) /
               255.0 for i in range(0, lh, int(lh/3)))
    return colorsys.rgb_to_hsv(r, g, b)


def slugify(value):
    """Generate a url or filename worthy string from input text"""
    value = unicodedata.normalize('NFKC', value)
    value = re.sub(r'[^.+\w\s-]', '', value).strip().lower()
    return re.sub(r'[-\s]+', '-', value)


RDMS = {}

with open('RDMMODELS.def') as f:
    for line in f.readlines():
        if len(line) > 0:
            props = line.split(" ")
            RDMS[props[5]] = {
                "manufacturer": int(props[0]),
                "device": int(props[6])
            }

with open('Carallon.def') as f:
    fixtureProfile = {
        "date": "",
        "editorVersion": "1.1.1.9.0.4",
        "personalities": []
    }
    personality = {}
    parameter = {}
    command = {}
    rangeItem = {}
    stepItem = {}

    fixturesList = {}

    filename = ""
    needsFade = True
    for line in f.readlines():
        if len(line) > 0:
            if "$TEMPLATE" in line:
                if personality != {}:
                    if stepItem != {}:
                        command["steps"].append(stepItem)
                        stepItem = {}
                    if command != {}:
                        personality["commands"].append(command)
                        command = {}
                    if parameter != {}:
                        if rangeItem != {}:
                            if "ranges" not in parameter:
                                parameter["ranges"] = []
                            parameter["ranges"].append(rangeItem)
                            if parameter["type"] == 5:
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] != "Intensity":
                                parameter["type"] = 4
                        if "ranges" in parameter:
                            parameter["ranges"] = sorted(
                                parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
                        parameter = {}
                    if personality["modeName"] == "":
                        personality["modeName"] = "-"
                    if personality["modeName"] == "-":
                        filename = personality["manufacturerName"]+"-" + \
                            personality["modelName"]
                    else:
                        filename = personality["manufacturerName"]+"-" + \
                            personality["modelName"] + \
                            "-"+personality["modeName"]
                    filename = slugify(filename)+".jlib"
                    if needsFade == True:
                        for param in personality["parameters"]:
                            if param["type"] == 5:
                                param["fadeWithIntensity"] = True
                    personality["parameters"] = sorted(
                        personality["parameters"], key=lambda i: i['coarse'])
                    if personality["dcid"] in RDMS:
                        personality["manufacturerID"] = RDMS[personality["dcid"]
                                                             ]["manufacturer"]
                        personality["deviceID"] = RDMS[personality["dcid"]]["device"]
                    fixtureProfile["personalities"].append(personality)
                    if not personality["manufacturerName"] in fixturesList:
                        fixturesList[personality["manufacturerName"]] = {}
                    if not personality["modelName"] in fixturesList[personality["manufacturerName"]]:
                        fixturesList[personality["manufacturerName"]
                                     ][personality["modelName"]] = {}
                    fixturesList[personality["manufacturerName"]
                                 ][personality["modelName"]][personality["modeName"]] = {
                                     "file": filename,
                                     "dcid": personality["dcid"],
                                     "modeName": personality["modeName"],
                                     "channels": personality["maxOffset"] + 1,
                                     "manufacturerID": personality["manufacturerID"],
                                     "deviceID": personality["deviceID"],
                                     "custom": 0
                    }
                    if debugPrint == True:
                        if os.path.exists("../fixtures/"+filename):
                            print(filename)
                    with open("../fixtures/"+filename, 'w', encoding='utf-8') as f:
                        json.dump(fixtureProfile, f,
                                  ensure_ascii=False, indent=4)

                    parameter = {}
                    rangeItem = {}
                    command = {}
                    stepItem = {}
                    needsFade = True

                    fixtureProfile = {
                        "date": "",
                        "editorVersion": "1.1.1.9.0.4",
                        "personalities": []
                    }
                    filename = ""

                personality = {}
            if "ENDDATA" in line:
                if personality != {}:
                    if stepItem != {}:
                        command["steps"].append(stepItem)
                        stepItem = {}
                    if command != {}:
                        personality["commands"].append(command)
                        command = {}
                    if parameter != {}:
                        if rangeItem != {}:
                            if "ranges" not in parameter:
                                parameter["ranges"] = []
                            parameter["ranges"].append(rangeItem)
                            if parameter["type"] == 5:
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] != "Intensity":
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] == "Intensity":
                                personality["hasIntensity"] = True
                        if "ranges" in parameter:
                            parameter["ranges"] = sorted(
                                parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
                        parameter = {}
                    if personality["modeName"] == "":
                        personality["modeName"] = "-"
                    if personality["modeName"] == "-":
                        filename = personality["manufacturerName"]+"-" + \
                            personality["modelName"]
                    else:
                        filename = personality["manufacturerName"]+"-" + \
                            personality["modelName"] + \
                            "-"+personality["modeName"]
                    filename = slugify(filename)+".jlib"
                    if needsFade == True:
                        for param in personality["parameters"]:
                            if param["type"] == 5:
                                param["fadeWithIntensity"] = True
                    personality["parameters"] = sorted(
                        personality["parameters"], key=lambda i: i['coarse'])
                    if personality["dcid"] in RDMS:
                        personality["manufacturerID"] = RDMS[personality["dcid"]
                                                             ]["manufacturer"]
                        personality["deviceID"] = RDMS[personality["dcid"]]["device"]
                    fixtureProfile["personalities"].append(personality)
                    if not personality["manufacturerName"] in fixturesList:
                        fixturesList[personality["manufacturerName"]] = {}
                    if not personality["modelName"] in fixturesList[personality["manufacturerName"]]:
                        fixturesList[personality["manufacturerName"]
                                     ][personality["modelName"]] = {}
                    fixturesList[personality["manufacturerName"]
                                 ][personality["modelName"]][personality["modeName"]] = {
                                     "file": filename,
                                     "dcid": personality["dcid"],
                                     "modeName": personality["modeName"],
                                     "channels": personality["maxOffset"] + 1,
                                     "manufacturerID": personality["manufacturerID"],
                                     "deviceID": personality["deviceID"],
                                     "custom": 0
                    }
                    if debugPrint == True:
                        if os.path.exists("../fixtures/"+filename):
                            print(filename)
                    with open("../fixtures/"+filename, 'w', encoding='utf-8') as f:
                        json.dump(fixtureProfile, f,
                                  ensure_ascii=False, indent=4)
            if "$$MANUFACTURER" in line:
                personality = {
                    "dcid": "",
                    "colortable": "",
                    "deviceID": None,
                    "manufacturerID": None,
                    "hasIntensity": False,
                    "manufacturerName": "",
                    "maxOffset": 0,
                    "modeName": "",
                    "modelName": "",
                    "parameters": [],
                    "commands": []
                }
                personality["manufacturerName"] = line.partition("$$MANUFACTURER")[
                    2].strip()
                if personality["manufacturerName"] == "":
                    personality["manufacturerName"] = "-"
            if "$$MODELNAME" in line:
                personality["modelName"] = line.partition("$$MODELNAME")[
                    2].strip()
                if personality["modelName"] == "":
                    personality["modelName"] = "-"
            if "$$MODENAME" in line:
                personality["modeName"] = line.partition("$$MODENAME")[
                    2].strip()
                if personality["modeName"] == "":
                    personality["modeName"] = "-"
            if "$$DCID" in line:
                personality["dcid"] = line.partition("$$DCID")[
                    2].strip()
            if "$$FOOTPRINT" in line:
                personality["maxOffset"] = int(line.partition("$$FOOTPRINT")[
                    2].strip())-1
            if "$$COLORTABLE" in line:
                personality["colortable"] = line.partition("$$COLORTABLE")[
                    2].strip()
            if "$$TIMESTAMP" in line:
                fixtureProfile["date"] = line.partition("$$TIMESTAMP")[
                    2].strip()
            if "$$PARAMETER" in line:
                if not "GROUP" in line:
                    if parameter != {}:
                        if rangeItem != {}:
                            if "ranges" not in parameter:
                                parameter["ranges"] = []
                            parameter["ranges"].append(rangeItem)
                            if parameter["type"] == 5:
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] != "Intensity":
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] == "Intensity":
                                personality["hasIntensity"] = True
                        if "ranges" in parameter:
                            parameter["ranges"] = sorted(
                                parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
                        parameter = {}
                    parameter = {
                        "coarse": 0,
                        # "fine": -1,
                        "fadeWithIntensity": False,
                        "highlight": 0,
                        "home": 0,
                        # "white": {
                        #    "val": None,
                        #    "temp": ""
                        # },
                        "invert": False,
                        "name": "",
                        # "ranges": [],
                        "size": 8,  # 8bit or 16bit
                        # "snap": False, (Not imported)
                        "type": 1
                    }

                    parameter["name"] = " ".join(line.partition("$$PARAMETER")[
                        2].strip().split(" ")[5:])
                    invertTest = " ".join(line.partition("$$PARAMETER")[
                        2].strip().split(" ")[3])
                    if (invertTest == "O N"):
                        parameter["invert"] = True
            if "$$OFFSET" in line:
                parameter["coarse"] = int(line.partition("$$OFFSET")[
                    2].strip().split(" ")[0])
                if line.partition("$$OFFSET")[2].strip().split(" ")[1] != "0":
                    parameter["size"] = 16
                    parameter["fine"] = int(line.partition(
                        "$$OFFSET")[2].strip().split(" ")[1])
            if "$$DEFAULT" in line:
                parameter["home"] = int(line.partition("$$DEFAULT")[
                    2].strip())
            if "$$WHITE" in line:
                tableInfo = line.partition("$$WHITE")[2].strip().split(" ")
                parameter["white"] = {}
                parameter["white"]["val"] = int(tableInfo[0])
                parameter["white"]["temp"] = tableInfo[1]
            if "$$HIGHLIGHT" in line:
                parameter["highlight"] = int(line.partition("$$HIGHLIGHT")[
                    2].strip())
            if "$$PARAMETERGROUP" in line:
                number = int(line.partition("$$PARAMETERGROUP")[2].strip())
                if number == 3:
                    parameter["type"] = 5
                if number == 1:
                    parameter["type"] = 1
                    needsFade = False
                    personality["hasIntensity"] = True
                if number == 4:
                    parameter["type"] = 4
                if number == 2:
                    parameter["type"] = 2
            if "$$DEVICECOMMAND" in line:
                if not "STEP" in line and not "ACTION" in line:
                    if command != {}:
                        if stepItem != {}:
                            command["steps"].append(stepItem)
                        personality["commands"].append(command)
                        stepItem = {}
                        command = {}
                    command = {
                        "name": "",
                        "steps": []
                    }
                    command["name"] = line.partition("$$DEVICECOMMAND")[
                        2].strip()
            if "$$DEVICECOMMANDSTEP" in line:
                if stepItem != {}:
                    command["steps"].append(stepItem)
                    stepItem = {}
                stepItem = {
                    "step": 0,
                    "key": -1,
                    "subkey": -1
                }
                tableInfo = line.partition("$$DEVICECOMMANDSTEP")[
                    2].strip().split(" ")
                stepItem["step"] = int(tableInfo[0])
            if "$$DEVICECOMMANDACTION" in line:
                tableInfo = line.partition("$$DEVICECOMMANDACTION")[
                    2].strip().split(" ")
                stepItem["key"] = int(tableInfo[0])
                stepItem["subkey"] = int(tableInfo[1])
            if "$$TABLE" in line:
                if rangeItem != {}:
                    if "ranges" not in parameter:
                        parameter["ranges"] = []
                    parameter["ranges"].append(rangeItem)
                    if parameter["type"] == 5:
                        parameter["type"] = 4
                    if parameter["type"] == 1 and parameter["name"] != "Intensity":
                        parameter["type"] = 4
                    rangeItem = {}
                rangeItem = {
                    "begin": 0,
                    "default": 0,
                    "end": 0,
                    "label": "",
                }
                tableInfo = line.partition("$$TABLE")[2].strip().split(" ")
                rangeItem["begin"] = int(tableInfo[0])
                rangeItem["end"] = int(tableInfo[1])
                rangeItem["label"] = " ".join(tableInfo[3:])
                if int(tableInfo[2]) == 0:
                    rangeItem["default"] = rangeItem["begin"]
                if int(tableInfo[2]) == 2:
                    rangeItem["default"] = rangeItem["end"]
                if int(tableInfo[2]) == 1:
                    rangeItem["default"] = int(
                        (rangeItem["begin"]+rangeItem["end"])/2)
            if "$$GEL" in line:
                if not "media" in rangeItem.keys():
                    rangeItem["media"] = {
                        "dcid": "",
                        "name": ""
                    }
                rangeItem["media"]["name"] = rangeItem["label"]
                rangeItem["media"]["dcid"] = line.partition("$$GEL")[2].strip()
            if "$$IMAGE" in line:
                if not "media" in rangeItem.keys():
                    rangeItem["media"] = {
                        "dcid": "",
                        "name": ""
                    }
                rangeItem["media"]["name"] = rangeItem["label"]
                rangeItem["media"]["dcid"] = line.partition("$$IMAGE")[
                    2].strip()
            if "$$SWATCH" in line:
                if not "media" in rangeItem.keys():
                    rangeItem["media"] = {
                        "b": None,
                        "g": None,
                        "name": "",
                        "r": None
                    }
                rangeItem["media"]["name"] = rangeItem["label"]
                rangeItem["media"]["b"] = int(line.partition("$$SWATCH")[
                                              2].strip().split(" ")[2])
                rangeItem["media"]["g"] = int(line.partition("$$SWATCH")[
                                              2].strip().split(" ")[1])
                rangeItem["media"]["r"] = int(line.partition("$$SWATCH")[
                                              2].strip().split(" ")[0])
    with open("../fixtures/fixtureList.json", 'w', encoding='utf-8') as f:
        json.dump(fixturesList, f, ensure_ascii=False, indent=4)

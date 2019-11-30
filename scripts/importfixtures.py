import re
import unicodedata
import json
import os
import colorsys


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


with open('Carallon.def') as f:
    fixtureProfile = {
        "date": "",
        "editorVersion": "1.1.1.9.0.4",
        "personalities": []
    }
    personality = {}
    parameter = {}
    swatches = []
    rangeItem = {}
    filename = ""
    needsFade = True
    for line in f.readlines():
        if len(line) > 0:
            if "$TEMPLATE" in line:
                if personality != {}:
                    if parameter != {}:
                        if rangeItem != {}:
                            parameter["ranges"].append(rangeItem)
                            if parameter["type"] == 5:
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] != "Intensity":
                                parameter["type"] = 4
                        parameter["ranges"] = sorted(
                            parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
                        parameter = {}
                    if personality["modeName"] == "":
                        personality["modeName"] = "-"
                    filename = personality["manufacturerName"]+"-" + \
                        personality["modelName"]+"-"+personality["modeName"]
                    filename = slugify(filename)+".jlib"
                    if needsFade == True:
                        for param in personality["parameters"]:
                            if param["type"] == 5:
                                param["fadeWithIntensity"] = True
                    personality["parameters"] = sorted(
                        personality["parameters"], key=lambda i: i['coarse'])
                    fixtureProfile["personalities"].append(personality)
                    #if os.path.exists("../fixtures/"+filename):
                    #    print(filename)
                    with open("../fixtures/"+filename, 'w', encoding='utf-8') as f:
                        json.dump(fixtureProfile, f,
                                  ensure_ascii=False, indent=4)

                    parameter = {}
                    rangeItem = {}
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
                    if parameter != {}:
                        if rangeItem != {}:
                            parameter["ranges"].append(rangeItem)
                            if parameter["type"] == 5:
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] != "Intensity":
                                parameter["type"] = 4
                        parameter["ranges"] = sorted(
                            parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
                        parameter = {}
                    if personality["modeName"] == "":
                        personality["modeName"] = "-"
                    filename = personality["manufacturerName"]+"-" + \
                        personality["modelName"]+"-"+personality["modeName"]
                    filename = slugify(filename)+".jlib"
                    if needsFade == True:
                        for param in personality["parameters"]:
                            if param["type"] == 5:
                                param["fadeWithIntensity"] = True
                    personality["parameters"] = sorted(
                        personality["parameters"], key=lambda i: i['coarse'])
                    fixtureProfile["personalities"].append(personality)
                    #if os.path.exists("../fixtures/"+filename):
                    #    print(filename)
                    with open("../fixtures/"+filename, 'w', encoding='utf-8') as f:
                        json.dump(fixtureProfile, f,
                                  ensure_ascii=False, indent=4)
            if "$$MANUFACTURER" in line:
                personality = {
                    "dcid": "",
                    "hasIntensity": False,
                    "manufacturerName": "",
                    "maxOffset": 0,
                    "modeName": "",
                    "modelName": "",
                    "colortable": "",
                    "parameters": []
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
                            parameter["ranges"].append(rangeItem)
                            if parameter["type"] == 5:
                                parameter["type"] = 4
                            if parameter["type"] == 1 and parameter["name"] != "Intensity":
                                parameter["type"] = 4
                        parameter["ranges"] = sorted(
                            parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
                        parameter = {}
                    parameter = {
                        "coarse": 0,
                        "fadeWithIntensity": False,
                        "highlight": 0,
                        "home": 0,
                        "invert": False,
                        "name": "",
                        "size": 8,  # 8bit or 16bit
                        "snap": False,
                        "type": 1,
                        "ranges": []
                    }

                    parameter["name"] = " ".join(line.partition("$$PARAMETER")[
                        2].strip().split(" ")[5:])

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
                if number == 4:
                    parameter["type"] = 4
                if number == 2:
                    parameter["type"] = 2
            if "$$TABLE" in line:
                if rangeItem != {}:
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
                rangeItem["media"] = {
                    "dcid": "",
                    "name": ""
                }
                rangeItem["media"]["name"] = rangeItem["label"]
                rangeItem["media"]["dcid"] = line.partition("$$GEL")[2].strip()
            if "$$SWATCH" in line:
                swatch = {
                    "name": "",
                    "color": "",
                    "parameters": [0, 0, 0]
                }
                swatch["name"] = rangeItem["label"]
                swatch["parameters"][0] = int(line.partition("$$SWATCH")[
                    2].strip().split(" ")[0])
                swatch["parameters"][1] = int(line.partition(
                    "$$SWATCH")[2].strip().split(" ")[1])
                swatch["parameters"][2] = int(line.partition("$$SWATCH")[
                    2].strip().split(" ")[2])
                swatch["color"] = "#"+("".join(
                    [format(val, '02X') for val in swatch["parameters"]]))
                if not swatch in swatches:
                    swatches.append(swatch)

#swatches = sorted(swatches, key=lambda i: get_hsv(i['color']))
#with open("../swatches.json", 'w') as f:
#    json.dump(swatches, f, indent=4)

import re
import unicodedata
import json


def slugify(value):
    """Generate a url or filename worthy string from input text"""
    value = unicodedata.normalize('NFKC', value)
    value = re.sub(r'[^\w\s-]', '', value).strip().lower()
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
    #lineNum = 0
    needsFade = True
    for line in f:
        #lineNum += 1
        if len(line) > 1:
            if "$TEMPLATE" in line:
                if personality != {}:
                    if filename != "":
                        filename = slugify(filename)+".jlib"
                        if needsFade == True:
                            for param in personality["parameters"]:
                                if param["type"] == 5:
                                    param["fadeWithIntensity"] = True
                        personality["parameters"] = sorted(
                            personality["parameters"], key=lambda i: i['coarse'])
                        fixtureProfile["personalities"].append(personality)
                        with open("../fixtures/"+filename, 'w') as f:
                            json.dump(fixtureProfile, f, indent=4)
                        fixtureProfile = {
                            "date": "",
                            "editorVersion": "1.1.1.9.0.4",
                            "personalities": []
                        }
                        print(filename)
                        filename = ""
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
            elif "ENDDATA" in line:
                if personality != {}:
                    filename = slugify(filename)+".jlib"
                    if needsFade == True:
                        for param in personality["parameters"]:
                            if param["type"] == 5:
                                param["fadeWithIntensity"] = True
                    personality["parameters"] = sorted(
                        personality["parameters"], key=lambda i: i['coarse'])
                    fixtureProfile["personalities"].append(personality)
                    with open('../fixtures/'+filename, 'w', encoding='utf-8') as f:
                        json.dump(fixtureProfile, f,
                                  ensure_ascii=False, indent=4)
            elif "$$MANUFACTURER" in line:
                personality["manufacturerName"] = line.partition("$$MANUFACTURER")[
                    2].strip()
            elif "$$MODELNAME" in line:
                personality["modelName"] = line.partition("$$MODELNAME")[
                    2].strip()
                filename = line.partition("$$MODELNAME")[
                    2].strip()
            elif "$$MODENAME" in line:
                personality["modeName"] = line.partition("$$MODENAME")[
                    2].strip()
                filename += "_"+line.partition("$$MODENAME")[
                    2].strip()
            elif "$$DCID" in line:
                personality["dcid"] = line.partition("$$DCID")[
                    2].strip()
            elif "$$FOOTPRINT" in line:
                personality["maxOffset"] = int(line.partition("$$FOOTPRINT")[
                    2].strip())-1
            elif "$$COLORTABLE" in line:
                personality["colortable"] = line.partition("$$COLORTABLE")[
                    2].strip()
            elif "$$TIMESTAMP" in line:
                fixtureProfile["date"] = line.partition("$$TIMESTAMP")[
                    2].strip()
            elif "$$PARAMETER" in line:
                if not "GROUP" in line:
                    if parameter != {}:
                        if rangeItem != {}:
                            parameter["ranges"].append(rangeItem)
                        parameter["ranges"] = sorted(
                            parameter["ranges"], key=lambda i: i['begin'])
                        personality["parameters"].append(parameter)
                        rangeItem = {}
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
            elif "$$OFFSET" in line:
                parameter["coarse"] = int(line.partition("$$OFFSET")[
                    2].strip().split(" ")[0])
                if line.partition("$$OFFSET")[2].strip().split(" ")[1] != "0":
                    parameter["size"] = 16
                    parameter["fine"] = int(line.partition(
                        "$$OFFSET")[2].strip().split(" ")[1])
            elif "$$DEFAULT" in line:
                parameter["home"] = int(line.partition("$$DEFAULT")[
                    2].strip())
            elif "$$HIGHLIGHT" in line:
                parameter["highlight"] = int(line.partition("$$HIGHLIGHT")[
                    2].strip())
            elif "$$PARAMETERGROUP" in line:
                number = int(line.partition("$$PARAMETERGROUP")[2].strip())
                if number == 3:
                    parameter["type"] = 5
                elif number == 1:
                    parameter["type"] = 1
                    needsFade = False
                elif number == 4:
                    parameter["type"] = 4
                elif number == 2:
                    parameter["type"] = 2
            elif "$$TABLE" in line:
                if rangeItem != {}:
                    parameter["ranges"].append(rangeItem)
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
                elif int(tableInfo[2]) == 2:
                    rangeItem["default"] = rangeItem["end"]
                elif int(tableInfo[2]) == 1:
                    rangeItem["default"] = int(
                        (rangeItem["begin"]+rangeItem["end"])/2)
            elif "$$GEL" in line:
                rangeItem["media"] = {
                    "dcid": "",
                    "name": ""
                }
                rangeItem["media"]["name"] = rangeItem["label"]
                rangeItem["media"]["dcid"] = line.partition("$$GEL")[2].strip()
            elif "$$SWATCH" in line:
                swatch = {
                    "red": 0,
                    "green": 0,
                    "blue": 0,
                    "name": ""
                }
                swatch["name"] = rangeItem["label"]
                swatch["red"] = int(line.partition("$$SWATCH")[
                                    2].strip().split(" ")[0])
                swatch["green"] = int(line.partition(
                    "$$SWATCH")[2].strip().split(" ")[1])
                swatch["blue"] = int(line.partition("$$SWATCH")[
                                     2].strip().split(" ")[1])
                if not swatch in swatches:
                    swatches.append(swatch)
print(len(swatches))

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
    filename = ""
    lineNum = 0
    needsFade = True
    for line in f:
        lineNum += 1
        if len(line) > 1:
            if "$TEMPLATE" in line:
                if personality != {}:
                    if filename != "":
                        filename = slugify(filename)+".jlib"
                        if needsFade == True:
                            for param in personality["parameters"]:
                                if param["type"] == 5:
                                    param["fadeWithIntensity"] = True
                        fixtureProfile["personalities"].append(personality)
                        with open("../fixtures/"+filename, 'w') as f:
                            json.dump(fixtureProfile, f, indent=4)
                        fixtureProfile = {
                            "date": "",
                            "editorVersion": "",
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
                    fixtureProfile["personalities"].append(personality)
                    with open('../fixtures/'+filename, 'w', encoding='utf-8') as f:
                        json.dump(fixtureProfile, f,
                                  ensure_ascii=False, indent=4)
                    fixtureProfile = {
                        "date": "",
                        "editorVersion": "",
                        "personalities": []
                    }
                    filename = ""
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
                        personality["parameters"].append(parameter)
                    parameter = {
                        "coarse": 0,
                        "fadeWithIntensity": False,
                        "highlight": 0,
                        "home": 0,
                        "invert": False,
                        "name": "",
                        "size": 8,  # 8bit or 16bit
                        "snap": False,
                        "type": 1
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

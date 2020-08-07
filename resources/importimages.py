import os
if not os.path.exists(os.path.join("../", "fixture-images")):
    os.makedirs(os.path.join("../", "fixture-images"))
images = []
last = 0
data = None
with open('IMAGES.dat', 'rb') as f:
    data = bytearray(f.read())
with open('IMAGES.idx', 'r') as ff:
    lines = ff.readlines()
    for l in range(1, len(lines)):
        li = lines[l].split(",")
        lr = lines[l-1].split(",")
        image = [lr[0], lr[3], None]
        image[2] = data[last+80:int(li[1])]
        last = int(li[1])
        images.append(image)

for image in images:
    with open('../fixture-images/'+image[0]+".png", 'wb') as f:
        f.write(bytes(image[2]))
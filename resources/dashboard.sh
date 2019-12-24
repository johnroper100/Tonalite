#!/bin/sh
sudo ip link set eth0 up
sudo ip addr add 192.168.0.103/24 dev eth0
npm start --prefix /home/pi/Tonalite &
chromium-browser --noerrdialogs --disable-infobars --kiosk --disable-pinch 192.168.0.103:3000

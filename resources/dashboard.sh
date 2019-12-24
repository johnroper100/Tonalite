#!/bin/sh
sudo ip link set eth0 up
sudo ip addr add 192.168.0.103/24 dev eth0
npm start --prefix /home/pi/Tonalite &
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' /home/pi/.config/chromium/Default/Preferences
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' /home/pi/.config/chromium/Default/Preferences
chromium-browser --noerrdialogs --overscroll-history-navagation=0 --disable-infobars --kiosk --disable-pinch 192.168.0.103:3000

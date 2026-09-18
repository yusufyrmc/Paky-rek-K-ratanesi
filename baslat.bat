@echo off
chcp 65001 > nul
title Pakyürek Kıraathanesi Sipariş Sistemi
color 0E

echo ====================================================================
echo             PAKYÜREK KIRAATHANESİ SİPARİŞ SİSTEMİ
echo ====================================================================
echo.
echo Sunucu başlatılıyor, lütfen bekleyin...
echo.

start "" "http://localhost:3000/ocak.html"

node server.js

pause

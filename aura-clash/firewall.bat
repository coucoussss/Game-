@echo off
rem ===========================================================================
rem  Aura Clash - ouverture des ports du pare-feu Windows pour le jeu en reseau local
rem  Clic droit sur ce fichier -> "Executer en tant qu'administrateur".
rem  Pour retirer les regles : firewall.bat /retirer
rem ===========================================================================
chcp 65001 >nul
title Aura Clash - Pare-feu Windows

net session >nul 2>&1
if errorlevel 1 (
  echo Ce script doit etre lance en administrateur :
  echo clic droit sur firewall.bat puis "Executer en tant qu'administrateur".
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="Aura Clash LAN (TCP)" >nul 2>&1
netsh advfirewall firewall delete rule name="Aura Clash LAN (UDP)" >nul 2>&1

if /i "%~1"=="/retirer" (
  echo Regles du pare-feu retirees.
  pause
  exit /b 0
)

rem TCP 41234-41243 : la partie (WebSocket). UDP 41235 : decouverte automatique des parties.
netsh advfirewall firewall add rule name="Aura Clash LAN (TCP)" dir=in action=allow protocol=TCP localport=41234-41243 profile=private,domain
netsh advfirewall firewall add rule name="Aura Clash LAN (UDP)" dir=in action=allow protocol=UDP localport=41235 profile=private,domain

echo.
echo Ports ouverts pour les reseaux prives : TCP 41234-41243 et UDP 41235.
echo Verifie aussi que ta connexion Wi-Fi/Ethernet est en profil "Prive"
echo (Parametres ^> Reseau et Internet ^> proprietes du reseau).
pause

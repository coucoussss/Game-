@echo off
rem ===========================================================================
rem  Aura Clash - construction du jeu en un seul .exe portable + archive .zip
rem  Double-clique sur ce fichier (Node.js 20 ou plus doit etre installe).
rem ===========================================================================
chcp 65001 >nul
title Aura Clash - Construction du .exe
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable.
  echo Installe la version LTS depuis https://nodejs.org puis relance build.bat
  pause
  exit /b 1
)

echo.
echo [1/3] Installation des dependances (npm install)...
call npm install
if errorlevel 1 goto :erreur

echo.
echo [2/3] Construction du .exe portable (npm run build)...
call npm run build
if errorlevel 1 goto :erreur

echo.
echo [3/3] Creation de l'archive .zip a envoyer (npm run zip)...
call npm run zip
if errorlevel 1 goto :erreur

echo.
echo ==========================================================================
echo  Termine !
echo   - Jeu    : release\AuraClash-1.0.0-portable.exe
echo   - Envoi  : release\AuraClash-1.0.0-windows.zip  (exe + guide + pare-feu)
echo ==========================================================================
start "" explorer "%~dp0release"
pause
exit /b 0

:erreur
echo.
echo [ERREUR] La construction a echoue. Lis les messages ci-dessus.
echo Astuce : supprime le dossier node_modules puis relance build.bat.
pause
exit /b 1

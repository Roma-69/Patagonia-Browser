@echo off
setlocal
chcp 65001 >nul
rem Guardamos la carpeta del script antes de cambiar de carpeta: %~dp0 puede cambiar
rem si el script se llamo con una ruta relativa.
set "AQUI=%~dp0"
pushd "%AQUI%"
rem Mismas herramientas portatiles que CREAR-APK-PRUEBA.cmd, solo para este proceso.
set "PATAGONIA_TOOLS=%USERPROFILE%\Documents\Codex\2026-09-02\re\.mobile-tools"
if exist "%PATAGONIA_TOOLS%\flutter\bin\flutter.bat" set "PATH=%PATAGONIA_TOOLS%\flutter\bin;%PATH%"
if not exist "%ANDROID_HOME%\platform-tools\adb.exe" if exist "%PATAGONIA_TOOLS%\android-sdk\platform-tools\adb.exe" set "ANDROID_HOME=%PATAGONIA_TOOLS%\android-sdk"
if exist "%ANDROID_HOME%\platform-tools\adb.exe" set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
if not exist "%JAVA_HOME%\bin\java.exe" if exist "%PATAGONIA_TOOLS%\jdk\jdk-17.0.20.1+1\bin\java.exe" set "JAVA_HOME=%PATAGONIA_TOOLS%\jdk\jdk-17.0.20.1+1"
if exist "%JAVA_HOME%\bin\java.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%AQUI%CREAR-APK-OFICIAL.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%AQUI%CREAR-APK-OFICIAL.ps1" -CarpetaClave "%~1"
)
if errorlevel 1 (
  echo.
  echo No se pudo generar el APK oficial. Envia una captura del error que aparece arriba.
  popd
  pause
  exit /b 1
)
popd
pause
exit /b 0

@echo off
REM ============================================================
REM  StreamFlix - Gerador de APK Android (Windows)
REM  Uso: dois cliques OU "build-apk.bat" no terminal
REM ============================================================

echo.
echo ============================================
echo   Gerando APK do StreamFlix
echo ============================================
echo.

if not exist "node_modules\" (
  echo Instalando dependencias npm...
  call npm install
  if errorlevel 1 goto erro
)

echo Compilando build de producao...
call npm run build
if errorlevel 1 goto erro

if not exist "android\" (
  echo Adicionando plataforma Android (primeira vez)...
  call npx cap add android
  if errorlevel 1 goto erro
)

echo Sincronizando com projeto Android...
call npx cap sync android
if errorlevel 1 goto erro

echo Gerando APK (pode levar alguns minutos)...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  cd ..
  goto erro
)
cd ..

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
  copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "StreamFlix.apk" >nul
  echo.
  echo ============================================
  echo   APK gerado com sucesso: StreamFlix.apk
  echo ============================================
  echo.
  echo Transfira StreamFlix.apk para o celular e instale.
  echo.
  pause
  exit /b 0
)

:erro
echo.
echo ERRO durante a geracao. Verifique os logs acima.
pause
exit /b 1

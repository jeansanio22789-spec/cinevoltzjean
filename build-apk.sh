#!/usr/bin/env bash
# ============================================================
#  StreamFlix — Gerador de APK Android (comando único)
# ============================================================
#  Uso:   ./build-apk.sh
#
#  Pré-requisitos (instale uma vez na sua máquina):
#    1. Node.js 18+        →  https://nodejs.org
#    2. Java JDK 17        →  https://adoptium.net
#    3. Android Studio     →  https://developer.android.com/studio
#       └─ Após instalar, abra uma vez para baixar o SDK
#    4. Variável de ambiente ANDROID_HOME apontando para o SDK
#       (geralmente ~/Library/Android/sdk no Mac
#        ou %LOCALAPPDATA%\Android\Sdk no Windows)
# ============================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   📱  Gerando APK do StreamFlix           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# 1. Dependências node
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}▸ Instalando dependências npm...${NC}"
  npm install
fi

# 2. Build da web
echo -e "${YELLOW}▸ Compilando build de produção...${NC}"
npm run build

# 3. Adiciona plataforma Android se ainda não existir
if [ ! -d "android" ]; then
  echo -e "${YELLOW}▸ Adicionando plataforma Android (primeira vez)...${NC}"
  npx cap add android
fi

# 4. Sincroniza assets web → projeto Android
echo -e "${YELLOW}▸ Sincronizando arquivos com o projeto Android...${NC}"
npx cap sync android

# 5. Compila o APK debug
echo -e "${YELLOW}▸ Gerando APK (pode levar alguns minutos)...${NC}"
cd android
if [ -f "./gradlew" ]; then
  chmod +x ./gradlew
  ./gradlew assembleDebug
else
  echo -e "${RED}✗ gradlew não encontrado. Algo deu errado em 'cap add android'.${NC}"
  exit 1
fi
cd ..

# 6. Copia o APK para a raiz com nome amigável
APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
APK_DST="StreamFlix.apk"

if [ -f "$APK_SRC" ]; then
  cp "$APK_SRC" "$APK_DST"
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✅  APK gerado com sucesso!             ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "📦 Arquivo: ${GREEN}$(pwd)/$APK_DST${NC}"
  echo -e "📏 Tamanho: $(du -h "$APK_DST" | cut -f1)"
  echo ""
  echo -e "${BLUE}Para instalar no celular:${NC}"
  echo -e "  • Transfira ${YELLOW}$APK_DST${NC} para o aparelho (USB, Drive, WhatsApp...)"
  echo -e "  • Toque no arquivo no celular e permita 'Instalar de fontes desconhecidas'"
  echo ""
  echo -e "${BLUE}Ou via USB com depuração ativada:${NC}"
  echo -e "  ${YELLOW}adb install -r $APK_DST${NC}"
  echo ""
else
  echo -e "${RED}✗ Falha ao gerar APK. Verifique os logs acima.${NC}"
  exit 1
fi

#!/bin/bash
# Подпись и нотаризация ZapretMac (требует Apple Developer Program).
#
# Перед запуском:
#   1. Установите Developer ID Application + Developer ID Installer в Keychain
#      (developer.apple.com → Certificates)
#   2. Сохраните учётные данные нотаризации:
#      xcrun notarytool store-credentials "zapret-notary" \
#        --apple-id "ВАШ_APPLE_ID" --team-id "TEAM_ID" \
#        --password "app-specific-password"
#   3. Экспортируйте переменные:
#      export CSC_NAME="Developer ID Application: Ваше Имя (TEAM_ID)"
#      export APPLE_ID="ваш@email.com"
#      export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#      export APPLE_TEAM_ID="TEAM_ID"
#
# Запуск: ./scripts/sign-and-notarize.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

die() { echo -e "${RED}[x] $*${NC}" >&2; exit 1; }
info() { echo -e "${GRN}[+] $*${NC}"; }
warn() { echo -e "${YLW}[!] $*${NC}"; }

# Проверка сертификата
IDENTITIES=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" || true)
if [ -z "$IDENTITIES" ]; then
  die "Нет сертификата «Developer ID Application» в Keychain.
  Без платного Apple Developer ($99/год) Apple не признает приложение официальным.
  Инструкция: см. ZapretMac Final/ПРОЧИТАЙ МЕНЯ.txt"
fi

info "Найденные сертификаты:"
echo "$IDENTITIES"

export CSC_IDENTITY_AUTO_DISCOVERY=true
export CSC_LINK="${CSC_LINK:-}"
export CSC_KEY_PASSWORD="${CSC_KEY_PASSWORD:-}"

# Сборка DMG + ZIP с подписью и нотаризацией (electron-builder)
info "Сборка, подпись и нотаризация..."
bash scripts/render-icons.sh

if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  export CSC_NOTARIZE=true
  info "Нотаризация включена (APPLE_ID + TEAM_ID)"
else
  warn "APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID не заданы — только подпись, без нотаризации"
  unset CSC_NOTARIZE
fi

# Временный конфиг с notarize для electron-builder
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.build.mac.notarize=!!process.env.CSC_NOTARIZE;
fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');
"

npx electron-builder --mac --arm64

# Убрать notarize из package.json
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
delete p.build.mac.notarize;
fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');
"

info "Готово. Артефакты в dist/"
ls -la dist/*.dmg dist/*.zip 2>/dev/null || true

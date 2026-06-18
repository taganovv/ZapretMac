#!/bin/bash
# Проверка статуса zapret. Лаконичный вывод (помещается в окно GUI).

if [ "$EUID" -ne 0 ]; then
    exec sudo -E "$0" "$@"
fi

INSTALL_DIR="/opt/zapret"
. "$INSTALL_DIR/mac/pf-check.sh" 2>/dev/null || pf_zapret_rules_ok() { return 1; }

if [ -d "$INSTALL_DIR" ]; then
    echo "Установка   : ✅ /opt/zapret"
else
    echo "Установка   : ❌ не установлен (запусти install.sh)"
    exit 0
fi

if [ -f /Library/LaunchDaemons/zapret.plist ]; then
    echo "Автозапуск  : ✅ launchd зарегистрирован"
else
    echo "Автозапуск  : ⚪ launchd не зарегистрирован"
fi

if pgrep -x tpws >/dev/null 2>&1; then
    echo "Процесс tpws: 🟢 работает (PID: $(pgrep -x tpws | tr '\n' ' '))"
elif [ -f /var/run/zapret.paused-by-vpn ]; then
    echo "Процесс tpws: ⏸ на паузе (обнаружен VPN, возобновится сам)"
else
    echo "Процесс tpws: ⚪ не запущен"
fi

if [ -f "$INSTALL_DIR/mac/.strategy" ]; then
    echo "Стратегия   : $(cat "$INSTALL_DIR/mac/.strategy")"
else
    echo "Стратегия   : default"
fi

if pfctl -s info 2>/dev/null | head -1 | grep -q Enabled; then
    echo "PF (фаервол): 🟢 включён"
else
    echo "PF (фаервол): ⚪ выключен"
fi

if pf_zapret_rules_ok; then
    echo "PF-якоря    : ✅ правила zapret загружены"
else
    echo "PF-якоря    : ⚪ правил zapret нет"
fi

# Реальный VPN: подключённый профиль или default route через туннель.
# utun* на macOS часто есть без VPN (iCloud, фильтры) — не путаем с VPN.
vpn_real_active() {
    scutil --nc list 2>/dev/null | grep -q '(Connected)' && return 0
    local ifc
    ifc=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    case "$ifc" in
        utun*|ipsec*|ppp*|tun*|tap*|wg*) return 0 ;;
    esac
    return 1
}

if vpn_real_active; then
    DEF_IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    echo "VPN         : 🔌 активен (${DEF_IF:-профиль в Системных настройках})"
else
    SYS_TUN=$(ifconfig 2>/dev/null | grep -Eo '^utun[0-9]+' | tr '\n' ' ')
    if [ -n "$SYS_TUN" ]; then
        echo "VPN         : — не включён (есть $SYS_TUN — системные, не VPN)"
    else
        echo "VPN         : — не включён"
    fi
fi

if [ -f "$INSTALL_DIR/ipset/zapret-hosts-user.txt" ]; then
    COUNT=$(grep -cvE '^\s*(#|$)' "$INSTALL_DIR/ipset/zapret-hosts-user.txt" 2>/dev/null)
    echo "Список сайтов: $COUNT доменов"
fi
exit 0

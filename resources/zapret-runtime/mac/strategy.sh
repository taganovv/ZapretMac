#!/bin/bash
# strategy.sh — переключение стратегии обхода DPI (tpws). Требует root.

if [ "$EUID" -ne 0 ]; then
    exec sudo -E "$0" "$@"
fi

INSTALL_DIR="/opt/zapret"
CONFIG="$INSTALL_DIR/config"
STATE="$INSTALL_DIR/mac/.strategy"

# имя|описание|80|443|mode(none пусто)
PRESETS="
default|Сплит SNI + disorder|--methodeol|--split-pos=1,midsld --disorder|hostlist
split-only|Только сплит|--methodeol|--split-pos=1,midsld|hostlist
midsld|Сплит midsld + disorder|--methodeol|--split-pos=midsld --disorder|hostlist
oob|OOB + split|--methodeol|--split-pos=1,midsld --oob|hostlist
hostcase|Hostcase + split|--methodeol --hostcase --hostdot|--split-pos=1 --disorder|hostlist
tlsrec|TLS record split sniext|--methodeol|--filter-l7=tls --tlsrec=sniext --split-pos=1,sniext --disorder|hostlist
split2|Split pos 2|--methodeol|--split-pos=2 --disorder --hostcase|hostlist
all443|Весь HTTPS без hostlist|--methodeol|--filter-l7=tls --split-pos=1,midsld --disorder|none
combo|TLS split + split-any|--methodeol|--filter-l7=tls --tlsrec=sni --split-pos=1,midsld --disorder|hostlist
"

die() { echo "[x] $*" >&2; exit 1; }

list_presets() {
    echo "$PRESETS" | while IFS='|' read -r name desc o80 o443 mode; do
        [ -n "$name" ] || continue
        echo "$name — $desc"
    done
}

find_preset() {
    echo "$PRESETS" | while IFS='|' read -r name desc o80 o443 mode; do
        [ "$name" = "$1" ] && echo "$o80|$o443|$mode"
    done
}

case "$1" in
    list) list_presets ;;
    current)
        if [ -f "$STATE" ]; then cat "$STATE"; else echo "default"; fi
        ;;
    set)
        NAME="$2"
        [ -n "$NAME" ] || die "Укажи имя стратегии"
        [ -f "$CONFIG" ] || die "zapret не установлен"
        OPTS=$(find_preset "$NAME")
        [ -n "$OPTS" ] || die "Нет стратегии: $NAME"
        O80="${OPTS%%|*}"; REST="${OPTS#*|}"; O443="${REST%%|*}"; MODE="${REST##*|}"

        if [ "$MODE" = "none" ]; then
            NEW_TPWS="TPWS_OPT=\"
--filter-tcp=80 $O80 --new
--filter-tcp=443 $O443
\""
            NEW_SOCKS="TPWS_SOCKS_OPT=\"
--filter-tcp=80 $O80 --new
--filter-tcp=443 $O443
\""
            sed -i '' 's/^MODE_FILTER=.*/MODE_FILTER=none/' "$CONFIG"
        else
            NEW_TPWS="TPWS_OPT=\"
--filter-tcp=80 $O80 <HOSTLIST> --new
--filter-tcp=443 $O443 <HOSTLIST>
\""
            NEW_SOCKS="TPWS_SOCKS_OPT=\"
--filter-tcp=80 $O80 <HOSTLIST> --new
--filter-tcp=443 $O443 <HOSTLIST>
\""
            sed -i '' 's/^MODE_FILTER=.*/MODE_FILTER=hostlist/' "$CONFIG"
        fi

        TMP=$(mktemp)
        NEW_TPWS="$NEW_TPWS" NEW_SOCKS="$NEW_SOCKS" awk '
            /^TPWS_OPT="/ { print ENVIRON["NEW_TPWS"]; skip=1; next }
            /^TPWS_SOCKS_OPT="/ { print ENVIRON["NEW_SOCKS"]; skip=1; next }
            skip && /^"$/ { skip=0; next }
            !skip { print }
        ' "$CONFIG" >"$TMP" || die "ошибка конфига"
        grep -q '^TPWS_OPT="' "$TMP" || die "конфиг сломан: TPWS_OPT"
        grep -q '^TPWS_SOCKS_OPT="' "$TMP" || die "конфиг сломан: TPWS_SOCKS_OPT"
        cat "$TMP" >"$CONFIG"
        rm -f "$TMP"
        echo "$NAME" >"$STATE"

        echo "[+] Стратегия «$NAME». Перезапуск..."
        "$INSTALL_DIR/mac/start.sh"
        ;;
    *)
        echo "Использование: strategy.sh list | current | set <имя>"
        exit 1
        ;;
esac

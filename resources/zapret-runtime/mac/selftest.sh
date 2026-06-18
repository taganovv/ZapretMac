#!/bin/bash
# selftest.sh — автоподбор стратегии (YouTube-first)

if [ "$EUID" -ne 0 ]; then
    exec sudo -E "$0" "$@"
fi

INSTALL_DIR="/opt/zapret"
MAC="$INSTALL_DIR/mac"
STRATEGIES="default tlsrec combo split2 oob midsld hostcase split-only all443"

TEST_DOMAINS="www.youtube.com youtube.com youtubei.googleapis.com"

[ -x "$MAC/strategy.sh" ] || { echo "[x] zapret не установлен."; exit 1; }

if scutil --nc list 2>/dev/null | grep -q '(Connected)'; then
    echo "[!] VPN активен — выключите для честного теста"
fi

test_domain() {
    local dom="$1"
    local res code
    res=$(curl -s -o /dev/null -m 12 -w "%{http_code}" --retry 0 "https://$dom/" 2>/dev/null)
    code="${res%% *}"
    if [ -n "$code" ] && [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 500 ]; then
        printf "    %-28s OK %s\n" "$dom" "$code"
        return 0
    fi
    printf "    %-28s FAIL\n" "$dom"
    return 1
}

BEST_NAME=""
BEST_OK=-1

for strat in $STRATEGIES; do
    echo "[*] $strat"
    "$MAC/strategy.sh" set "$strat" >/dev/null 2>&1
    sleep 2

    if ! pgrep -x tpws >/dev/null 2>&1; then
        echo "    tpws не запущен — пропуск"
        continue
    fi

    ok=0; total=0
    for dom in $TEST_DOMAINS; do
        total=$((total + 1))
        test_domain "$dom" && ok=$((ok + 1))
    done
    echo "[=] $strat: $ok/$total"
    if [ "$ok" -gt "$BEST_OK" ]; then
        BEST_OK="$ok"; BEST_NAME="$strat"
    fi
    [ "$ok" -ge 2 ] && break
done

if [ -n "$BEST_NAME" ] && [ "$BEST_OK" -gt 0 ]; then
    echo "[★] Лучшая: $BEST_NAME ($BEST_OK/$total)"
    "$MAC/strategy.sh" set "$BEST_NAME" >/dev/null 2>&1
    echo "BEST=$BEST_NAME OK=$BEST_OK"
    exit 0
fi

echo "[x] Ни одна стратегия не открыла YouTube"
exit 1

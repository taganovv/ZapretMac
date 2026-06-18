#!/bin/bash
# Пост-установка: IFACE_LAN, блокировка QUIC, SOCKS-резерв. Требует root.
set -e

INSTALL_DIR="/opt/zapret"
CONFIG="$INSTALL_DIR/config"

[ -f "$CONFIG" ] || { echo "[x] config не найден"; exit 1; }

IFACE=""
for cand in $(networksetup -listallhardwareports 2>/dev/null | awk '/Device:/{print $2}') en0 en1 en2; do
  [ -n "$cand" ] || continue
  if ifconfig "$cand" 2>/dev/null | grep -q 'status: active'; then
    IFACE="$cand"
    break
  fi
done
if [ -z "$IFACE" ]; then
  IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
fi
[ -n "$IFACE" ] || IFACE=en0

echo "[+] Интерфейс LAN: $IFACE"

# IFACE_LAN — без него PF не перехватывает трафик на Wi-Fi/Ethernet
if grep -q '^IFACE_LAN=' "$CONFIG" 2>/dev/null; then
  sed -i '' "s/^IFACE_LAN=.*/IFACE_LAN=$IFACE/" "$CONFIG"
else
  printf '\nIFACE_LAN=%s\n' "$IFACE" >>"$CONFIG"
fi

# SOCKS-резерв (браузер через системный прокси)
grep -q '^TPWS_SOCKS_ENABLE=' "$CONFIG" && sed -i '' 's/^TPWS_SOCKS_ENABLE=.*/TPWS_SOCKS_ENABLE=1/' "$CONFIG" || echo 'TPWS_SOCKS_ENABLE=1' >>"$CONFIG"
grep -q '^TPPORT_SOCKS=' "$CONFIG" && sed -i '' 's/^TPPORT_SOCKS=.*/TPPORT_SOCKS=11080/' "$CONFIG" || echo 'TPPORT_SOCKS=11080' >>"$CONFIG"

# Хук: блокировка QUIC после поднятия PF
HOOK="$INSTALL_DIR/mac/quic-block.sh"
grep -q '^INIT_FW_POST_UP_HOOK=' "$CONFIG" || echo "INIT_FW_POST_UP_HOOK=\"$HOOK\"" >>"$CONFIG"
chmod +x "$HOOK" 2>/dev/null || true

# Якорь QUIC в pf.conf (один раз)
if ! grep -q 'anchor "zapret-udp"' /etc/pf.conf 2>/dev/null; then
  printf '\nanchor "zapret-udp"\n' >>/etc/pf.conf
  pfctl -qf /etc/pf.conf 2>/dev/null || true
fi

# Расширенный список YouTube
HOSTS="$INSTALL_DIR/ipset/zapret-hosts-user.txt"
for d in youtube.com www.youtube.com googlevideo.com ytimg.com youtubei.googleapis.com gstatic.com googleapis.com google.com www.google.com; do
  grep -qxF "$d" "$HOSTS" 2>/dev/null || echo "$d" >>"$HOSTS"
done

echo "[+] post-install готов"
"$INSTALL_DIR/mac/setup-sudoers.sh" 2>/dev/null || true
exit 0

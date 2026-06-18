#!/bin/bash
# Обновляет /etc/sudoers.d/zapret — управление без пароля из ZapretMac.
INSTALL_DIR="${INSTALL_DIR:-/opt/zapret}"

GUI_USER="${SUDO_USER:-}"
[ -z "$GUI_USER" ] || [ "$GUI_USER" = "root" ] && GUI_USER="$(stat -f%Su /dev/console 2>/dev/null)"
[ -z "$GUI_USER" ] || [ "$GUI_USER" = "root" ] && exit 0

TMP=$(mktemp)
cat >"$TMP" <<EOF
# ZapretMac — управление обходом без пароля (скрипты root-owned).
$GUI_USER ALL=(root) NOPASSWD: $INSTALL_DIR/mac/start.sh, $INSTALL_DIR/mac/stop.sh, $INSTALL_DIR/mac/status.sh, $INSTALL_DIR/mac/strategy.sh, $INSTALL_DIR/mac/selftest.sh, $INSTALL_DIR/mac/post-install.sh, $INSTALL_DIR/init.d/macos/zapret
EOF
if visudo -cf "$TMP" 2>/dev/null; then
  install -m 0440 -o root -g wheel "$TMP" /etc/sudoers.d/zapret
fi
rm -f "$TMP"

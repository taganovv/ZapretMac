#!/bin/bash
# Добавляет домены из zapret-hosts.txt в пользовательский список.
INSTALL_DIR="${INSTALL_DIR:-/opt/zapret}"
SRC="${1:-$INSTALL_DIR/mac/zapret-hosts.txt}"
HOSTS="$INSTALL_DIR/ipset/zapret-hosts-user.txt"

[ -f "$SRC" ] || exit 0
[ -f "$HOSTS" ] || touch "$HOSTS"

while IFS= read -r line || [ -n "$line" ]; do
  d="${line%%#*}"
  d="$(echo "$d" | xargs)"
  [ -z "$d" ] && continue
  grep -qxF "$d" "$HOSTS" 2>/dev/null || echo "$d" >>"$HOSTS"
done <"$SRC"

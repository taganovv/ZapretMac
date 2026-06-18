#!/bin/bash
# Блокировка QUIC (UDP 443) — YouTube иначе обходит tpws
QUIC_ANCHOR=/etc/pf.anchors/zapret-udp
mkdir -p /etc/pf.anchors
cat >"$QUIC_ANCHOR" <<'EOF'
block return out quick proto udp from any to any port 443
block return out quick proto udp from any to any port 19294:19344
EOF
pfctl -qa zapret-udp -f "$QUIC_ANCHOR" 2>/dev/null || true
pfctl -qe 2>/dev/null || true

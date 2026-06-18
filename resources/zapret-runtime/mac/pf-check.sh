#!/bin/bash
# Проверка: загружены ли PF-правила zapret.
pf_zapret_rules_ok() {
    pfctl -a zapret-v4 -s nat 2>/dev/null | grep -qE 'rdr ' && return 0
    pfctl -a zapret-v4 -sr 2>/dev/null | grep -qE 'rdr ' && return 0
    if [ -f /etc/pf.anchors/zapret-v4 ] && grep -qE 'rdr ' /etc/pf.anchors/zapret-v4 2>/dev/null; then
        pfctl -s info 2>/dev/null | head -1 | grep -q Enabled && return 0
    fi
    return 1
}

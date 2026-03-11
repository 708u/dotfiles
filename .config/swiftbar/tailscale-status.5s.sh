#!/bin/bash
TS=/etc/profiles/per-user/708u/bin/tailscale
if $TS status &>/dev/null; then
  echo ":network: TS | sfcolor=white"
else
  echo ":network: TS | sfcolor=red"
fi

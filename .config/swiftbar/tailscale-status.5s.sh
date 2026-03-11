#!/bin/bash
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
if $TS status &>/dev/null; then
  echo ":network: TS | sfcolor=white"
else
  echo ":network: TS | sfcolor=red"
fi

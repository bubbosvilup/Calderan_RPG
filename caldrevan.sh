#!/usr/bin/env bash
# Caldrevan launcher for Linux and macOS (docs/LAUNCHER.md): ./caldrevan.sh
# Opens the same launcher page as Caldrevan.cmd (PLAY / STOP / OPEN GAME / logs / Exit). Needs Node.js 22 or newer.
# Never touches saves or configuration, never installs anything. `--print-desktop-entry` prints a .desktop file for this checkout and exits.
set -u
self="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then self="$(readlink -f -- "$self" 2>/dev/null || printf '%s' "$self")"; fi
here="$(cd -- "$(dirname -- "$self")" 2>/dev/null && pwd -P)" || { echo "Could not open the Caldrevan folder." >&2; exit 1; }
cd -- "$here" || { echo "Could not open the Caldrevan folder." >&2; exit 1; }

if [ "$#" -gt 0 ]; then
  if [ "$1" = "--print-desktop-entry" ] && [ "$#" -eq 1 ]; then
    printf '[Desktop Entry]\nType=Application\nName=Caldrevan\nComment=Start the Caldrevan launcher\nExec="%s/caldrevan.sh"\nPath=%s\nTerminal=false\nCategories=Game;\n' "$here" "$here"
    exit 0
  fi
  echo "Usage: ./caldrevan.sh                 open the launcher (PLAY / STOP in the browser page)" >&2
  echo "       ./caldrevan.sh --print-desktop-entry   print a .desktop file for this checkout" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on this computer." >&2
  echo "Install Node.js 22 LTS from https://nodejs.org (or your package manager), then run ./setup.sh and ./caldrevan.sh again." >&2
  exit 1
fi
exec node "$here/scripts/launcher/main.mjs" --detach

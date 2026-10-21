#!/usr/bin/env bash
# Caldrevan first-time setup for Linux and macOS (docs/LAUNCHER.md): npm ci, npm run build, npm run ui:build. Visible output, stops at the first failure.
# Never touches saves or configuration. Stop the game first (a running game can lock files in node_modules).
set -u
self="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then self="$(readlink -f -- "$self" 2>/dev/null || printf '%s' "$self")"; fi
here="$(cd -- "$(dirname -- "$self")" 2>/dev/null && pwd -P)" || { echo "Could not open the Caldrevan folder." >&2; exit 1; }
cd -- "$here" || { echo "Could not open the Caldrevan folder." >&2; exit 1; }

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm were not found on this computer." >&2
  echo "Install Node.js 22 LTS from https://nodejs.org (or your package manager), then run ./setup.sh again." >&2
  exit 1
fi
echo "Caldrevan setup. This installs dependencies and builds the game; it can take a few minutes."
step() {
  echo; echo "[$1/3] $2"
  shift 2
  "$@" || { echo >&2; echo "Setup stopped because the step above failed. Read the error above it, fix the cause, then run ./setup.sh again." >&2; exit 1; }
}
step 1 "npm ci" npm ci
step 2 "npm run build" npm run build
step 3 "npm run ui:build" npm run ui:build
echo; echo "Setup finished. Run ./caldrevan.sh to play."

#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/launch.py
else
  echo 'Install Python 3.11+ from https://python.org/downloads/ or use Docker Compose (docs/SETUP.md).'
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

if command -v brew >/dev/null 2>&1; then
  ruby_prefix="$(brew --prefix ruby 2>/dev/null || true)"
  if [ -n "${ruby_prefix}" ] && [ -d "${ruby_prefix}/bin" ]; then
    export PATH="${ruby_prefix}/bin:${PATH}"
  fi
fi

exec "$@"

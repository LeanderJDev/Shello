#!/usr/bin/env bash
set -euo pipefail

# Simple runner for development: starts backend (Python) and frontend (Vite/NPM)
# - creates a Python venv at `backend/.venv` if missing and installs requirements
# - detects package manager (npm/pnpm/yarn) and starts frontend dev server

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# load .env if present (simple parser, ignores comments)
if [ -f .env ]; then
  echo "Loading environment from .env"
  set -a
  # shellcheck disable=SC2002
  cat .env | sed '/^\s*#/d' | sed '/^$/d' | while IFS='=' read -r k v; do
    if [ -n "$k" ]; then
      export "$k"="$v"
    fi
  done
  set +a
fi

### Backend setup and start
if [ ! -d backend/.venv ]; then
  echo "Creating Python virtualenv at backend/.venv"
  python3 -m venv backend/.venv
fi
echo "Installing backend requirements (may re-run pip install)..."
backend/.venv/bin/python -m pip install --upgrade pip >/dev/null
backend/.venv/bin/python -m pip install -r backend/requirements.txt >/dev/null || true

echo "Starting backend (logs -> backend/server.log)..."
backend/.venv/bin/python backend/server.py > backend/server.log 2>&1 &
BACKEND_PID=$!

# wait a short time and verify backend didn't exit immediately
sleep 3
if kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend appears to be running (PID $BACKEND_PID)"
else
  echo "Error: backend stopped within 3 seconds. Showing last 200 log lines:"
  if [ -f backend/server.log ]; then
    tail -n 200 backend/server.log || true
  else
    echo "No backend/server.log found."
  fi
  exit 1
fi

### Frontend start
cd frontend
PKG_MANAGER="npm"
if [ -f pnpm-lock.yaml ]; then
  PKG_MANAGER="pnpm"
elif [ -f yarn.lock ]; then
  PKG_MANAGER="yarn"
elif [ -f package-lock.json ]; then
  PKG_MANAGER="npm"
fi

echo "Using package manager: $PKG_MANAGER"
echo "Installing frontend dependencies (if needed)..."
case "$PKG_MANAGER" in
  pnpm)
    pnpm install --silent || true
    pnpm dev &
    ;;
  yarn)
    yarn install --silent || true
    yarn dev &
    ;;
  *)
    npm install --silent || true
    npm run dev &
    ;;
esac
FRONTEND_PID=$!

cd "$ROOT_DIR"

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl-C to stop both processes"

trap 'echo "Stopping..."; kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; wait' INT TERM
wait

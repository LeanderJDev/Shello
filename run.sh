#!/usr/bin/env bash
set -euo pipefail

# Simple runner for development: starts backend (Python) and frontend (Vite/NPM)
# - creates a Python venv at `backend/.venv` if missing and installs requirements
# - detects package manager (npm/pnpm/yarn) and starts frontend dev server

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# parse CLI args: --backend-port / -b and --frontend-port / -f
BACKEND_PORT="${SHELLO_WS_PORT:-12000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
MODE="dev" # default: dev; set to 'production' with --production or -P
while [ "$#" -gt 0 ]; do
  case "$1" in
    -b|--backend-port)
      BACKEND_PORT="$2"
      shift 2
      ;;
    -f|--frontend-port)
      FRONTEND_PORT="$2"
      shift 2
      ;;
    -P|--production|--prod)
      MODE="production"
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

export SHELLO_WS_PORT="$BACKEND_PORT"
export VITE_PORT="$FRONTEND_PORT"
export PORT="$FRONTEND_PORT"
# Expose the backend port to Vite as VITE_SHELLO_WS_PORT so builds/dev server can pick it up
export VITE_SHELLO_WS_PORT="$BACKEND_PORT"

echo "Mode: $MODE"

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
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv backend/.venv
  elif command -v python >/dev/null 2>&1; then
    python -m venv backend/.venv
  else
    echo "Error: no python interpreter found to create venv" >&2
    exit 1
  fi
fi
echo "Installing backend requirements (may re-run pip install)..."
if [ -x backend/.venv/bin/python ]; then
  backend/.venv/bin/python -m pip install --upgrade pip >/dev/null
  backend/.venv/bin/python -m pip install -r backend/requirements.txt >/dev/null || true
else
  if command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --upgrade pip >/dev/null
    python3 -m pip install -r backend/requirements.txt >/dev/null || true
  else
    python -m pip install --upgrade pip >/dev/null
    python -m pip install -r backend/requirements.txt >/dev/null || true
  fi
fi

echo "Starting backend (logs -> backend/server.log) on port $BACKEND_PORT..."
cd backend
# ensure SHELLO_WS_PORT is exported for the server
export SHELLO_WS_PORT="$BACKEND_PORT"
if [ -x .venv/bin/python ]; then
  .venv/bin/python server.py > server.log 2>&1 &
else
  if command -v python3 >/dev/null 2>&1; then
    python3 server.py > server.log 2>&1 &
  else
    python server.py > server.log 2>&1 &
  fi
fi
BACKEND_PID=$!
cd "$ROOT_DIR"

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
    if [ "$MODE" = "dev" ]; then
      VITE_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" pnpm dev &
    else
      VITE_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" pnpm run build && PORT="$FRONTEND_PORT" pnpm start &
    fi
    ;;
  yarn)
    yarn install --silent || true
    if [ "$MODE" = "dev" ]; then
      VITE_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" yarn dev &
    else
      VITE_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" yarn build && PORT="$FRONTEND_PORT" yarn start &
    fi
    ;;
  *)
    npm install --silent || true
    if [ "$MODE" = "dev" ]; then
      VITE_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" npm run dev &
    else
      VITE_PORT="$FRONTEND_PORT" PORT="$FRONTEND_PORT" npm run build && PORT="$FRONTEND_PORT" npm start &
    fi
    ;;
esac
FRONTEND_PID=$!

cd "$ROOT_DIR"

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl-C to stop both processes"

trap 'echo "Stopping..."; kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; wait' INT TERM
wait

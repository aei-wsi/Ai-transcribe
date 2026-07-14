#!/usr/bin/env bash
#
# One-shot setup for self-hosting Recall on an always-on machine (e.g. a spare
# laptop). Installs system deps where it can, builds the app, creates .env, and
# starts it under pm2 with auto-restart. Safe to re-run.
#
# Usage (from the project directory):   bash setup.sh
# Skip launching pm2 (just build/config):  RECALL_NO_START=1 bash setup.sh
#
set -euo pipefail

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

cd "$(dirname "$0")"

# --- 1. Node (required; we don't auto-install a runtime) --------------------
have node || die "Node.js 20+ is required. Install it from https://nodejs.org and re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ required (found $(node -v)). Upgrade and re-run."
info "Node $(node -v) OK"

# --- 2. Detect a package manager for system deps ---------------------------
PM=""
if have brew; then PM=brew
elif have apt-get; then PM=apt
elif have dnf; then PM=dnf
elif have pacman; then PM=pacman
fi
SUDO=""; [ "$(id -u)" -ne 0 ] && have sudo && SUDO=sudo

# --- 3. ffmpeg + yt-dlp (needed only for YouTube/social link ingestion) ----
install_ffmpeg() {
  case "$PM" in
    brew)   brew install ffmpeg ;;
    apt)    $SUDO apt-get update -y && $SUDO apt-get install -y ffmpeg ;;
    dnf)    $SUDO dnf install -y ffmpeg ;;
    pacman) $SUDO pacman -S --noconfirm ffmpeg ;;
    *)      return 1 ;;
  esac
}
install_ytdlp() {
  if [ "$PM" = brew ]; then
    brew install yt-dlp
  elif have curl; then
    # Latest static binary — the most reliable cross-distro path.
    $SUDO curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp && $SUDO chmod a+rx /usr/local/bin/yt-dlp
  else
    return 1
  fi
}

if have ffmpeg; then info "ffmpeg OK"; else
  info "Installing ffmpeg..."; install_ffmpeg || warn "Could not auto-install ffmpeg — link ingestion needs it (see SETUP.md). Uploads/voice/meetings still work."
fi
if have yt-dlp; then info "yt-dlp OK"; else
  info "Installing yt-dlp..."; install_ytdlp || warn "Could not auto-install yt-dlp — YouTube/social link ingestion needs it (see SETUP.md). Uploads/voice/meetings still work."
fi

# --- 4. pm2 (process manager / boot persistence) ---------------------------
if have pm2; then info "pm2 OK"; else
  info "Installing pm2..."
  npm install -g pm2 || $SUDO npm install -g pm2 || die "Could not install pm2. Try: sudo npm install -g pm2"
fi

# --- 5. App dependencies + build -------------------------------------------
info "Installing app dependencies..."; npm install
info "Building..."; npm run build

# --- 6. .env (never clobber an existing one) -------------------------------
if [ -f .env ]; then
  info ".env already exists — leaving it untouched"
else
  cp .env.example .env
  info "Created .env in mock mode. Add ASSEMBLYAI_API_KEY + ANTHROPIC_API_KEY (and set STT_PROVIDER=assemblyai) for real transcripts, then: pm2 restart all"
fi

# --- 7. Launch under pm2 ---------------------------------------------------
if [ "${RECALL_NO_START:-0}" = "1" ]; then
  info "Build complete. Start it later with:  pm2 start ecosystem.config.cjs"
  exit 0
fi
info "Starting under pm2..."
pm2 start ecosystem.config.cjs
pm2 save
PORT_SHOWN="${PORT:-3000}"
echo
info "Recall is running → http://localhost:${PORT_SHOWN}  (or http://<this-machine-IP>:${PORT_SHOWN} on your LAN)"
info "Auto-start on boot:  run 'pm2 startup' and paste the command it prints."
info "Logs: pm2 logs   |   Status: pm2 status   |   Restart after editing .env: pm2 restart all"

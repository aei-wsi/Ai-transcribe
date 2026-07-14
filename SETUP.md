# Running Recall on a spare laptop (self-hosted)

This is the zero-refactor, $0 way to run Recall: your own always-on machine.
Everything works natively — SQLite on disk, the background worker, and `yt-dlp`
for YouTube/social ingestion (which serverless hosts like Vercel can't run).

The steps below assume macOS or Linux on the laptop. Windows notes are called out
where they differ.

---

## Quick install (one line)

If Node.js 20+ is already installed, this clones the repo and runs `setup.sh`,
which installs the rest (ffmpeg, yt-dlp, pm2), builds, and starts it under pm2:

```bash
git clone <your-repo-url> Ai-transcribe && cd Ai-transcribe && git checkout claude/competitor-ai-transcription-analysis-kj1cho && bash setup.sh
```

(Drop the `git checkout …` once the branch is merged to `main`.) Already cloned?
Just run `bash setup.sh` from the project directory. It's safe to re-run, and it
won't overwrite an existing `.env`. Then add your API keys to `.env` and
`pm2 restart all`. The manual steps below explain each part if you'd rather do it
by hand or something needs troubleshooting.

---

## 1. Prerequisites (install once)

- **Node.js 20+** — https://nodejs.org (Node 22 recommended)
- **yt-dlp** and **ffmpeg** — needed to download & convert audio from links:
  - macOS: `brew install yt-dlp ffmpeg`
  - Debian/Ubuntu: `sudo apt install ffmpeg` then `pipx install yt-dlp` (or `pip install yt-dlp`)
  - Verify: `yt-dlp --version` and `ffmpeg -version` both print something.
- **pm2** (keeps the app running & auto-starts on boot): `npm install -g pm2`

> yt-dlp updates often to keep pace with YouTube. Refresh it every so often
> (`pip install -U yt-dlp` / `brew upgrade yt-dlp`) if link downloads start failing.

---

## 2. Get the code & install

```bash
git clone <your-repo-url> Ai-transcribe
cd Ai-transcribe
git checkout claude/competitor-ai-transcription-analysis-kj1cho   # until merged to main
npm install
```

---

## 3. Configure

```bash
cp .env.example .env
```

Then edit `.env`. Minimum for real (non-mock) use:

```ini
STT_PROVIDER=assemblyai
ASSEMBLYAI_API_KEY=your-assemblyai-key
ANTHROPIC_API_KEY=your-anthropic-key      # summaries / quotes / tagging / meeting notes
```

Leave it as the defaults (`STT_PROVIDER=mock`, no keys) to try the app with
placeholder transcripts first. Both the web app and the worker read this `.env`.

For the YouTube "saves" sync, also fill in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
(see the README's YouTube connector notes).

---

## 4. Build & start (with auto-restart)

```bash
npm run build
pm2 start ecosystem.config.cjs
```

That launches two processes: `recall-web` (the site, on port 3000) and
`recall-worker` (transcription). Check them with:

```bash
pm2 status
pm2 logs            # live logs from both; Ctrl-C to stop watching
```

Open **http://localhost:3000** on the laptop, or **http://<laptop-LAN-IP>:3000**
from another device on the same Wi-Fi (find the IP with `ifconfig` / `ip addr`).

---

## 5. Survive reboots

```bash
pm2 save            # remember the current process list
pm2 startup         # prints one command — copy/paste & run it (sets up boot service)
```

After this, the app and worker come back automatically when the laptop restarts.
On a laptop, also disable sleep-on-lid-close so it keeps serving:
- macOS: `sudo pmset -a disablesleep 1` (or Amphetamine/caffeinate)
- Ubuntu: Settings → Power → turn off automatic suspend

---

## 6. Reach it from anywhere (optional)

By default the app is only reachable on your home network. To use it from your
phone on the go, pick one (both free, neither exposes your home IP or needs
router port-forwarding):

- **Tailscale** (simplest, fully private) — install on the laptop *and* your phone,
  sign in to the same account, then browse to `http://<laptop-tailscale-name>:3000`.
  Nothing is public; only your own devices can reach it.
- **Cloudflare Tunnel** (gives a real public HTTPS URL) — `brew install cloudflared`
  (or download), then `cloudflared tunnel --url http://localhost:3000`. It prints a
  `https://…trycloudflare.com` URL that points at your laptop. For a stable custom
  domain, set up a named tunnel per Cloudflare's docs.

> If you expose it publicly (Cloudflare Tunnel with a fixed URL), remember the app
> currently has **no login** — anyone with the URL can use it. Keep the URL private,
> or put Cloudflare Access in front of it, until app-level auth is added.

Installing it as a phone "app": open the site in mobile Safari/Chrome → Share →
**Add to Home Screen**. That also enables the share-sheet target (send a YouTube/
TikTok link straight to Recall).

---

## 7. Everyday commands

```bash
pm2 restart all            # after changing .env
pm2 stop all               # pause
pm2 logs recall-worker     # watch just the worker
```

### Updating to the latest code

```bash
git pull
npm install
npm run build
pm2 restart all
```

Your library (the `data/` folder — SQLite DB + downloaded audio) is untouched by
updates. Back it up by copying that folder.

---

## Troubleshooting

- **A pasted link fails / stays in "error"** — usually `yt-dlp` is missing or
  outdated, or the video needs a login. Run `yt-dlp --version`; update it; for
  login-required content set `YTDLP_EXTRA_ARGS=--cookies-from-browser chrome` in
  `.env` and `pm2 restart all`.
- **Notes stay "queued" forever** — the worker isn't running. `pm2 status` should
  show `recall-worker` online; `pm2 logs recall-worker` shows why if not.
- **Transcripts are placeholder text** — you're still in mock mode. Set
  `STT_PROVIDER=assemblyai` + `ASSEMBLYAI_API_KEY` and `pm2 restart all`.
- **Port 3000 in use** — set `PORT=3001` in `.env` (or your shell) and restart.

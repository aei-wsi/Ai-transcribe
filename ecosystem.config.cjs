// PM2 process config for running Recall on an always-on machine (e.g. a spare
// laptop-turned-server). Starts the Next.js web app and the transcription
// worker, restarts them on crash, and — with `pm2 startup` + `pm2 save` — brings
// them back after a reboot. See SETUP.md for the full walkthrough.
module.exports = {
  apps: [
    {
      name: "recall-web",
      script: "npm",
      args: "run start",
      env: {
        // Change the port here (or set PORT in your shell) if 3000 is taken.
        PORT: process.env.PORT || "3000",
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "recall-worker",
      script: "npm",
      args: "run worker",
      autorestart: true,
      restart_delay: 3000,
    },
  ],
};

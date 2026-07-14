/**
 * Background worker: processes queued notes (fetch -> transcribe -> enrich).
 * Run alongside the web app:  npm run worker
 */
import dotenv from "dotenv";
import { runNextJob } from "./lib/pipeline";

// Next.js auto-loads .env for the web app, but this standalone worker does not —
// load it here so ASSEMBLYAI_API_KEY / ANTHROPIC_API_KEY / etc. are available.
// .env.local wins over .env (dotenv keeps the first value it sees for each key).
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const IDLE_POLL_MS = 3000;

async function main() {
  console.log("[worker] started — polling for jobs");
  let stopping = false;
  process.on("SIGINT", () => (stopping = true));
  process.on("SIGTERM", () => (stopping = true));

  while (!stopping) {
    let didWork = false;
    try {
      didWork = await runNextJob();
      if (didWork) console.log("[worker] processed a job");
    } catch (err) {
      console.error("[worker] job runner error:", err);
    }
    if (!didWork) await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
  }
  console.log("[worker] stopped");
}

main();

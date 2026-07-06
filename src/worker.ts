/**
 * Background worker: processes queued notes (fetch -> transcribe -> enrich).
 * Run alongside the web app:  npm run worker
 */
import { runNextJob } from "./lib/pipeline";

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

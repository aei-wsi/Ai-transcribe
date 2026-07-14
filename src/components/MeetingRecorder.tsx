"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { recordMeeting } from "@/app/actions";

type State = "idle" | "recording" | "saving";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm", "audio/ogg", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Non-disruptive meeting capture: records the meeting tab's audio locally via
 * getDisplayMedia (plus your mic), with NO bot joining the call. Gated behind an
 * explicit consent acknowledgement — the design principle is "always disclose,
 * never interrupt."
 */
export default function MeetingRecorder() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async () => {
    setError(null);
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getDisplayMedia) {
      setError("Screen/tab audio capture isn't supported in this browser.");
      return;
    }
    try {
      // Tab/system audio — user picks the meeting tab and enables "share audio".
      const display = await md.getDisplayMedia({ audio: true, video: true });
      const tabAudio = display.getAudioTracks();
      if (tabAudio.length === 0) {
        display.getTracks().forEach((t) => t.stop());
        setError(
          'No audio was shared. Re-try and tick "Share tab audio" in the picker.'
        );
        return;
      }

      // Mix tab audio + mic into one recorded track.
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(new MediaStream(tabAudio)).connect(dest);

      let mic: MediaStream | null = null;
      try {
        mic = await md.getUserMedia({ audio: true });
        ctx.createMediaStreamSource(mic).connect(dest);
      } catch {
        // mic optional — proceed with tab audio only
      }

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        dest.stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];

      const cleanup = () => {
        display.getTracks().forEach((t) => t.stop());
        mic?.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      cleanupRef.current = cleanup;

      // If the user stops sharing via the browser's own control, stop cleanly.
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopTimer();
        cleanup();
        setState("saving");
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        const form = new FormData();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        form.append("audio", blob, `meeting-${stamp}.${ext}`);
        form.append(
          "title",
          title.trim() || `Meeting — ${new Date().toLocaleString()}`
        );
        try {
          await recordMeeting(form);
          router.refresh();
        } catch {
          setError("Could not save the meeting recording.");
        }
        setState("idle");
        setSeconds(0);
        setTitle("");
      };

      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Screen-share permission was denied.");
    }
  }, [router, title]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (state === "recording") {
    return (
      <div className="row" style={{ marginTop: "0.6rem" }}>
        <button type="button" onClick={stop}>
          ■ Stop &amp; save meeting ({mmss})
        </button>
        <span className="meta" style={{ color: "var(--accent)" }}>
          ● capturing meeting audio locally
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.6rem" }}>
      <div className="row">
        <input
          type="text"
          placeholder="Meeting title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: "1 1 240px" }}
        />
        <button
          type="button"
          className="secondary"
          onClick={start}
          disabled={!acknowledged || state === "saving"}
          title={!acknowledged ? "Confirm disclosure first" : undefined}
        >
          {state === "saving" ? "Saving…" : "▶ Record meeting (tab audio)"}
        </button>
      </div>
      <label
        className="meta"
        style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>
          I&apos;ve disclosed to participants that this meeting is being transcribed
          (e.g. in the invite or at the start). Many jurisdictions require all-party
          consent.
        </span>
      </label>
      {error && (
        <p className="error-text" style={{ marginTop: "0.4rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}

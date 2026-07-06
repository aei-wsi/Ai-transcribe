"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { recordVoiceNote } from "@/app/actions";

type State = "idle" | "recording" | "saving";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm", "audio/ogg", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function VoiceRecorder() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("saving");
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        const form = new FormData();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        form.append("audio", blob, `voice-note-${stamp}.${ext}`);
        form.append("title", `Voice note — ${new Date().toLocaleString()}`);
        try {
          await recordVoiceNote(form);
          router.refresh();
        } catch {
          setError("Could not save the recording.");
        }
        setState("idle");
        setSeconds(0);
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone permission was denied.");
    }
  }, [router]);

  const stop = useCallback(() => {
    stopTimer();
    recorderRef.current?.stop();
  }, []);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="row" style={{ marginTop: "0.6rem" }}>
      {state === "recording" ? (
        <>
          <button type="button" onClick={stop}>
            ■ Stop &amp; save ({mmss})
          </button>
          <span className="meta" style={{ color: "var(--accent)" }}>
            ● recording…
          </span>
        </>
      ) : (
        <button
          type="button"
          className="secondary"
          onClick={start}
          disabled={state === "saving"}
        >
          {state === "saving" ? "Saving…" : "● Record voice note"}
        </button>
      )}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

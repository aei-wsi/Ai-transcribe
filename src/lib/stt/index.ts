import type { TranscriptResult } from "../types";
import { transcribeWithAssemblyAI } from "./assemblyai";
import { transcribeWithMock } from "./mock";

export interface SttProvider {
  name: string;
  transcribe(audioPath: string): Promise<TranscriptResult>;
}

export function getSttProvider(): SttProvider {
  const provider = (process.env.STT_PROVIDER ?? "mock").toLowerCase();
  switch (provider) {
    case "assemblyai":
      return { name: "assemblyai", transcribe: transcribeWithAssemblyAI };
    case "mock":
      return { name: "mock", transcribe: transcribeWithMock };
    default:
      throw new Error(
        `Unknown STT_PROVIDER "${provider}". Supported: assemblyai, mock.`
      );
  }
}

// Thin HTTP client for the main video-streaming-backend's status
// endpoint. queuing-system has no direct database access by design
// — this is the only way it communicates a result back once a
// transcoding job finishes or permanently fails.

import { env } from "../config/env";

export interface ReportReadyInput {
  videoId: string;
  playbackUrl: string;
}

export interface ReportFailedInput {
  videoId: string;
  errorMessage: string;
}

async function patchStatus(videoId: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${env.BACKEND_URL}/api/videos/${videoId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend status update responded ${res.status}: ${text}`);
  }
}

export async function reportVideoReady(input: ReportReadyInput): Promise<void> {
  await patchStatus(input.videoId, { status: "ready", playbackUrl: input.playbackUrl });
}

export async function reportVideoFailed(input: ReportFailedInput): Promise<void> {
  await patchStatus(input.videoId, { status: "failed", errorMessage: input.errorMessage });
}
// Thin HTTP client for the queuing-system's producer (a fully
// separate Bun process/repo — see ../../../queuing-system). The main
// backend never touches Redis or BullMQ directly; it just tells the
// producer "this video is ready to transcode" over HTTP.

import { env } from "../config/env";

export interface EnqueueTranscodeJobInput {
  videoId: string;
  s3Key: string;
}

/**
 * Calls the queuing-system's POST /jobs. Throws on failure — caller
 * decides how to handle that (e.g. log and continue, since a failed
 * enqueue shouldn't necessarily fail the whole upload response back
 * to the browser).
 */
export async function enqueueTranscodeJob(input: EnqueueTranscodeJobInput): Promise<void> {
  const res = await fetch(`${env.QUEUE_PRODUCER_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Queue producer responded ${res.status}: ${text}`);
  }
}
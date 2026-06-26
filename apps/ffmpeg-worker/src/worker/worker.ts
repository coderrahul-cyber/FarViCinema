// The actual job consumer — runs as its own process (`bun run
// worker`), fully separate from the producer. Per request, this
// worker runs in the SAME process/server as the producer's queue
// logic conceptually, but as a separate running process — both
// connect to the same Redis instance and never talk to each other
// directly.
//
// Pipeline per job: download raw file from MinIO -> encode all 4
// renditions with ffmpeg -> build master playlist -> upload HLS
// output back to MinIO -> report success/failure to the main
// backend's status endpoint (queuing-system has no DB access of its
// own, by design).

import { Worker, type Job } from "bullmq";
import { createWorkerConnection } from "../lib/redis-connection";
import { env } from "../config/env";
import type { TranscodeJobData } from "../lib/types";
import { transcodeVideo } from "./transcode/transcode-video";
import { reportVideoReady, reportVideoFailed } from "../lib/backend-client";

const connection = createWorkerConnection();

const workerId = process.env.WORKER_ID ?? "Worker-1";

console.log(`[${workerId}] started, listening on queue "${env.QUEUE_NAME}"`);

async function processJob(job: Job<TranscodeJobData>) {
  console.log(`[${[workerId]}] picked up job ${job.id} for video ${job.data.videoId} (s3Key: ${job.data.s3Key})`);

  const result = await transcodeVideo(job);

  const playbackUrl = `${env.HLS_PUBLIC_BASE_URL}/${result.masterPlaylistKey}`;

  // Reporting failure here is intentionally NOT caught — if this
  // throws, BullMQ's retry logic (see queue.ts's defaultJobOptions)
  // will retry the whole job, including re-transcoding. That's
  // wasteful but correct: we'd rather redo work than silently leave
  // a video stuck in "processing" forever because the one HTTP call
  // that tells the backend "it's done" failed transiently.
  await reportVideoReady({ videoId: result.videoId, playbackUrl });

  console.log(`[worker] job ${job.id} done — ${playbackUrl}`);
  return result;
}

const worker = new Worker<TranscodeJobData>(env.QUEUE_NAME, processJob, {
  connection,
  concurrency: env.WORKER_CONCURRENCY,
  // A 5 GB video can take well over 5 minutes to transcode across 4
  // renditions. lockDuration is BullMQ's heartbeat timeout — if a
  // job is still "active" past this many ms with no heartbeat, it's
  // declared stalled and re-queued. Set generously; the actual
  // running transcode isn't aborted by this setting, only BullMQ's
  // bookkeeping about whether to consider it abandoned.
  lockDuration: 30 * 60 * 1000, // 30 minutes
});

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);

  if (!job) return;

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (isLastAttempt) {
    try {
      await reportVideoFailed({ videoId: job.data.videoId, errorMessage: err.message });
    } catch (reportErr) {
      // If even the failure report fails, there's nothing more this
      // worker can do — log loudly so it's visible in monitoring,
      // since the video will be stuck in "processing" until someone
      // investigates.
      console.error(`[worker] ALSO failed to report failure for video ${job.data.videoId}:`, reportErr);
    }
  }
});

worker.on("error", (err) => {
  // Connection-level errors (e.g. Redis temporarily unreachable)
  // land here, separate from per-job failures above.
  console.error("[worker] connection error:", err);
});

console.log(`Worker started, listening on queue "${env.QUEUE_NAME}" (concurrency: ${env.WORKER_CONCURRENCY})`);

// Graceful shutdown — let in-flight jobs finish instead of marking
// them "stalled" on every restart during development. Critically
// important here specifically: killing the process mid-ffmpeg leaves
// a corrupt partial output and an orphaned child process.
async function shutdown(signal: string) {
  console.log(`Received ${signal}, closing worker (waiting for in-flight jobs)...`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

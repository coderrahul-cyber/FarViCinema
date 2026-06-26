// // src/worker/transcode/transcode-video.ts
// //
// // Ties every step together: download -> encode each rendition ->
// // build master playlist -> upload everything -> clean up the temp
// // directory. This is the function the BullMQ worker actually calls
// // per job (see ../worker.ts).

// import { mkdir, rm, writeFile } from "fs/promises";
// import os from "os";
// import path from "path";
// import type { Job } from "bullmq";
// import { downloadRawFile } from "./download";
// import { runFfmpegForRendition } from "./run-ffmpeg";
// import { buildMasterPlaylist } from "./master-playlist";
// import { uploadHlsOutput } from "./uploads";
// import { ALL_RENDITIONS, type RenditionName } from "./renditions";
// import type { TranscodeJobData } from "../../lib/types";

// export interface TranscodeResult {
//   videoId: string;
//   status: "ready";
//   masterPlaylistKey: string;
// }

// export async function transcodeVideo(job: Job<TranscodeJobData>): Promise<TranscodeResult> {
//   const { videoId, s3Key } = job.data;
//   const renditions: RenditionName[] = ALL_RENDITIONS;

//   // Scoped to this specific job ID so concurrent jobs (concurrency >
//   // 1) never collide on the same temp path.
//   const tmpDir = path.join(os.tmpdir(), `transcode-${job.id}`);
//   await mkdir(tmpDir, { recursive: true });

//   try {
//     await job.updateProgress({ percent: 5, stage: "downloading", videoId });
//     const rawPath = await downloadRawFile(s3Key, tmpDir);

//     await job.updateProgress({ percent: 15, stage: "transcoding", videoId });

//     // Renditions run sequentially — see run-ffmpeg.ts header comment
//     // for why this is the deliberate default rather than
//     // Promise.all().
//     for (let i = 0; i < renditions.length; i++) {
//       const rendition = renditions[i]!;

//       await runFfmpegForRendition(rawPath, tmpDir, rendition, (event) => {
//         if (event.percent === undefined) return;
//         // Spread this rendition's internal 0-100 progress across its
//         // slice of the overall 15-85% transcoding range.
//         const sliceStart = 15 + Math.round((i / renditions.length) * 70);
//         const sliceEnd = 15 + Math.round(((i + 1) / renditions.length) * 70);
//         const overallPercent = Math.round(
//           sliceStart + (event.percent / 100) * (sliceEnd - sliceStart),
//         );
//         void job.updateProgress({ percent: overallPercent, stage: `encoding ${rendition}`, videoId });
//       });

//       const completedPct = 15 + Math.round(((i + 1) / renditions.length) * 70);
//       await job.updateProgress({ percent: completedPct, stage: `encoded ${rendition}`, videoId });
//     }

//     await job.updateProgress({ percent: 90, stage: "building playlist", videoId });
//     const masterContent = buildMasterPlaylist(renditions);
//     await writeFile(path.join(tmpDir, "master.m3u8"), masterContent, "utf8");

//     await job.updateProgress({ percent: 95, stage: "uploading", videoId });
//     const { masterPlaylistKey } = await uploadHlsOutput({ videoId, tmpDir, renditions });

//     await job.updateProgress({ percent: 100, stage: "done", videoId });

//     return { videoId, status: "ready", masterPlaylistKey };
//   } finally {
//     // Always clean up local disk, whether this succeeded or threw —
//     // a failed transcode shouldn't leave gigabytes of temp files
//     // behind on every retry.
//     await rm(tmpDir, { recursive: true, force: true });
//   }
// }



//new 

// src/transcode/transcode-video.ts

import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Job } from "bullmq";
import { downloadRawFile } from "./download";
import { runFfmpegForRendition } from "./run-ffmpeg";
import { buildMasterPlaylist } from "./master-playlist";
import { uploadHlsOutput } from "./uploads";
import { ALL_RENDITIONS, type RenditionName } from "./renditions";
import type { TranscodeJobData } from "../../lib/types";
import { s3Delete, BUCKETS } from "../../lib/s3";

export interface TranscodeResult {
  videoId: string;
  status: "ready";
  masterPlaylistKey: string;
}

export async function transcodeVideo(job: Job<TranscodeJobData>): Promise<TranscodeResult> {
  const { videoId, s3Key } = job.data;
  const renditions: RenditionName[] = ALL_RENDITIONS;

  // Scoped to this specific job ID so concurrent jobs (concurrency > 1)
  // never collide on the same temp path.
  const tmpDir = path.join(os.tmpdir(), `transcode-${job.id}`);
  await mkdir(tmpDir, { recursive: true });

  let stage = "init";

  try {
    // ── 1. Download ────────────────────────────────────────────────────────
    stage = "downloading";
    await job.updateProgress({ percent: 5, stage, videoId });
    const rawPath = await downloadRawFile(s3Key, tmpDir);
    console.log(`[transcode] ${videoId} downloaded to ${rawPath}`);

    // ── 2. Encode all renditions ───────────────────────────────────────────
    // Renditions run sequentially — ffmpeg already saturates all CPU cores
    // for a single encode. Running them in parallel would thrash the CPU
    // with no throughput gain and much higher peak RAM usage.
    stage = "transcoding";
    await job.updateProgress({ percent: 15, stage, videoId });

    for (let i = 0; i < renditions.length; i++) {
      const rendition = renditions[i]!;
      stage = `encoding:${rendition}`;

      await runFfmpegForRendition(rawPath, tmpDir, rendition, (event) => {
        if (event.percent === undefined) return;
        // Map this rendition's 0–100% into its slice of the 15–85% range.
        const sliceStart = 15 + Math.round((i / renditions.length) * 70);
        const sliceEnd   = 15 + Math.round(((i + 1) / renditions.length) * 70);
        const overall    = Math.round(sliceStart + (event.percent / 100) * (sliceEnd - sliceStart));
        void job.updateProgress({ percent: overall, stage, videoId });
      });

      const donePct = 15 + Math.round(((i + 1) / renditions.length) * 70);
      await job.updateProgress({ percent: donePct, stage: `encoded:${rendition}`, videoId });
      console.log(`[transcode] ${videoId} rendition ${rendition} done (${i + 1}/${renditions.length})`);
    }

    // ── 3. Build + write master playlist ──────────────────────────────────
    stage = "building_playlist";
    await job.updateProgress({ percent: 90, stage, videoId });
    const masterContent = buildMasterPlaylist(renditions);
    await writeFile(path.join(tmpDir, "master.m3u8"), masterContent, "utf8");

    // ── 4. Upload HLS output ───────────────────────────────────────────────
    stage = "uploading";
    await job.updateProgress({ percent: 95, stage, videoId });
    const { masterPlaylistKey } = await uploadHlsOutput({ videoId, tmpDir, renditions });
     stage = "deleting_raw";
    try {
      await s3Delete(BUCKETS.raw, s3Key);
      await s3Delete(BUCKETS.raw, `${s3Key}.info`);
      console.log(`[transcode] ${videoId} deleted raw file ${s3Key}`);
    } catch (deleteErr) {
      // A failed delete shouldn't fail the whole job — the video is
      // already successfully transcoded and playable at this point.
      // Leftover raw storage is a cost issue, not a correctness one.
      console.error(`[transcode] ${videoId} failed to delete raw file ${s3Key}:`, deleteErr);
    }
    
    await job.updateProgress({ percent: 100, stage: "done", videoId });
    console.log(`[transcode] ${videoId} complete — ${masterPlaylistKey}`);

    return { videoId, status: "ready", masterPlaylistKey };

  } catch (err) {
    // Re-throw with stage context so worker.on("failed") logs show exactly
    // where in the pipeline this job died, without swallowing the original
    // stack trace.
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`[${stage}] ${message}`);
    wrapped.stack = err instanceof Error ? err.stack : wrapped.stack;
    throw wrapped;

  } finally {
    // Always clean up temp files — a failed transcode on every retry would
    // otherwise leave gigabytes of partial output on disk indefinitely.
    //
    // Trade-off: retries re-download and re-transcode from scratch. This is
    // acceptable because:
    //   a) failures should be rare in steady state
    //   b) partial ffmpeg output is not safe to resume
    //   c) disk space on the worker is more constrained than MinIO bandwidth
    //
    // If re-download cost becomes a problem, persist tmpDir across retries
    // by keying it on job.id (already done) and only cleaning up in
    // worker.on("completed") and worker.on("failed") instead of here.
    await rm(tmpDir, { recursive: true, force: true }).catch((cleanupErr) => {
      // Never let cleanup failure mask the real error — just log it.
      console.error(`[transcode] failed to clean up ${tmpDir}:`, cleanupErr);
    });
  }
}
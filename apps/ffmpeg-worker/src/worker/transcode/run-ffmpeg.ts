// src/worker/transcode/run-ffmpeg.ts
//
// Runs ffmpeg for a single rendition via Bun.spawn — no
// fluent-ffmpeg wrapper, since that adds another layer of
// child_process handling we'd rather not debug blind (see how many
// Bun/stream surprises we already hit with @tus/server). Bun.spawn
// is native, well-documented Bun API.
//
// Renditions are run sequentially, not in parallel, per the doc's
// guidance: parallel encoding is faster but uses N times the CPU
// simultaneously, and a CPU-bound queue worker on a single machine
// should profile that trade-off deliberately rather than defaulting
// to it. Sequential is the safe default; revisit if transcoding
// time becomes the bottleneck.

import { mkdir } from "fs/promises";
import path from "path";
import { env } from "../../config/env";
import { buildFfmpegArgs, type RenditionName, RENDITION_SPECS } from "./renditions";

export interface FfmpegProgressEvent {
  rendition: RenditionName;
  /** 0-100. May be undefined for renditions where duration couldn't be parsed from stderr. */
  percent: number | undefined;
}

/**
 * Parses ffmpeg's stderr progress lines to extract elapsed encoded
 * time, used to estimate percent complete against the known total
 * duration. ffmpeg writes progress to stderr, not stdout — this is
 * standard ffmpeg behavior, not a Bun quirk.
 *
 * Example line: "frame=  120 fps= 30 q=23.0 size=...  time=00:00:04.00 bitrate=..."
 */
function parseTimeSeconds(line: string): number | null {
  const match = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Runs ffprobe to get the input's duration in seconds — needed to
 * turn ffmpeg's "time=00:00:04.00" progress lines into a percentage.
 * Returns null if duration can't be determined (progress will then
 * report percent: undefined rather than guessing).
 */
async function getDurationSeconds(inputPath: string): Promise<number | null> {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) return null;

  const output = await proc.stdout.text();
  const duration = parseFloat(output.trim());
  return Number.isFinite(duration) ? duration : null;
}

export async function runFfmpegForRendition(
  inputPath: string,
  tmpDir: string,
  rendition: RenditionName,
  onProgress?: (event: FfmpegProgressEvent) => void,
): Promise<string> {
  const spec = RENDITION_SPECS[rendition];
  const outDir = path.join(tmpDir, rendition);
  await mkdir(outDir, { recursive: true });

  const durationSeconds = await getDurationSeconds(inputPath);
  const args = buildFfmpegArgs(inputPath, outDir, spec);

  const proc = Bun.spawn([env.FFMPEG_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // ffmpeg writes all progress and error info to stderr. Read it
  // line-by-line as it streams rather than waiting for the process
  // to exit and reading it all at once — this is what lets us
  // report progress while encoding is still running, and avoids
  // buffering a potentially large stderr log fully in memory.
  let stderrBuffer = "";
  const stderrReader = proc.stderr;

  const stderrTask = (async () => {
    for await (const chunk of stderrReader) {
      const text = Buffer.from(chunk).toString("utf8");
      stderrBuffer += text;

      if (durationSeconds && onProgress) {
        const elapsed = parseTimeSeconds(text);
        if (elapsed !== null) {
          const percent = Math.min(100, Math.round((elapsed / durationSeconds) * 100));
          onProgress({ rendition, percent });
        }
      }
    }
  })();

  const [exitCode] = await Promise.all([proc.exited, stderrTask]);

  if (exitCode !== 0) {
    // Keep only the tail of stderr in the thrown error — ffmpeg logs
    // can be thousands of lines for a long video, and the useful
    // error is almost always at the end.
    const tail = stderrBuffer.split("\n").slice(-40).join("\n");
    throw new Error(`ffmpeg failed for ${rendition} (exit code ${exitCode}):\n${tail}`);
  }

  const playlistPath = path.join(outDir, "index.m3u8");
  const playlistFile = Bun.file(playlistPath);
  if (!(await playlistFile.exists())) {
    throw new Error(`ffmpeg reported success for ${rendition} but index.m3u8 was not created`);
  }

  return outDir;
}
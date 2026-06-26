//
// The four output qualities, matching the pipeline doc's spec
// exactly. Two separate tables here on purpose: RENDITION_SPECS
// drives the actual ffmpeg encoding settings; PLAYLIST_SPECS drives
// the BANDWIDTH/RESOLUTION values written into the master playlist.
// They're related but conceptually different — encoding bitrate
// (what we tell the encoder to target) vs. advertised bandwidth
// (what we tell the player to expect, used for ABR switching
// decisions) aren't required to be identical, even though they
// happen to line up closely here.

export type RenditionName = "240p" | "480p" | "720p" | "1080p";

export const ALL_RENDITIONS: RenditionName[] = ["240p", "480p", "720p", "1080p"];

export interface RenditionSpec {
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const RENDITION_SPECS: Record<RenditionName, RenditionSpec> = {
  "240p": { width: 426, height: 240, videoBitrate: "400k", audioBitrate: "64k" },
  "480p": { width: 854, height: 480, videoBitrate: "1000k", audioBitrate: "128k" },
  "720p": { width: 1280, height: 720, videoBitrate: "2500k", audioBitrate: "128k" },
  "1080p": { width: 1920, height: 1080, videoBitrate: "5000k", audioBitrate: "192k" },
};

export interface PlaylistSpec {
  bandwidth: number;
  resolution: string;
}

export const PLAYLIST_SPECS: Record<RenditionName, PlaylistSpec> = {
  "240p": { bandwidth: 500_000, resolution: "426x240" },
  "480p": { bandwidth: 1_200_000, resolution: "854x480" },
  "720p": { bandwidth: 2_800_000, resolution: "1280x720" },
  "1080p": { bandwidth: 5_500_000, resolution: "1920x1080" },
};

/**
 * Builds the full ffmpeg argv for one rendition. Returns a plain
 * string[] suitable for Bun.spawn(["ffmpeg", ...args]) — no
 * fluent-ffmpeg, no child_process wrapper, just the raw CLI
 * invocation ffmpeg itself documents.
 */
export function buildFfmpegArgs(
  inputPath: string,
  outDir: string,
  spec: RenditionSpec,
): string[] {
  return [
    "-y", // overwrite output files without prompting (we control outDir, always fresh)
    "-i",
    inputPath,

    // --- video ---
    "-c:v",
    "libx264",
    "-b:v",
    spec.videoBitrate,
    "-vf",
    `scale=${spec.width}:${spec.height}:force_original_aspect_ratio=decrease,pad=${spec.width}:${spec.height}:(ow-iw)/2:(oh-ih)/2:black`,
    "-preset",
    "fast",
    "-crf",
    "23",
    "-sc_threshold",
    "0",
    "-g",
    "48",
    "-keyint_min",
    "48",
    "-pix_fmt",
    "yuv420p",

    // --- audio ---
    "-c:a",
    "aac",
    "-b:a",
    spec.audioBitrate,
    "-ac",
    "2",

    // --- HLS output ---
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    `${outDir}/seg_%04d.ts`,

    `${outDir}/index.m3u8`,
  ];
}
// src/worker/transcode/master-playlist.ts
//
// The master playlist is the entry point the player loads first —
// it lists every rendition with its bandwidth/resolution so the
// player can pick a starting quality and switch later based on
// measured bandwidth.

import { ALL_RENDITIONS, PLAYLIST_SPECS, type RenditionName } from "./renditions";

/**
 * Renditions must be listed lowest-to-highest bitrate — some older
 * players pick the first entry as their starting quality, so listing
 * highest-first would force a slow start even on a fast connection.
 */
export function buildMasterPlaylist(renditions: RenditionName[]): string {
  const ordered = ALL_RENDITIONS.filter((r) => renditions.includes(r));

  let m3u8 = "#EXTM3U\n#EXT-X-VERSION:3\n\n";

  for (const name of ordered) {
    const spec = PLAYLIST_SPECS[name];
    // avc1.42c01e = H.264 Baseline profile, mp4a.40.2 = AAC-LC.
    // Declaring codecs up front lets the browser bail out before
    // downloading anything if it can't decode this combination.
    m3u8 += `#EXT-X-STREAM-INF:BANDWIDTH=${spec.bandwidth},RESOLUTION=${spec.resolution},CODECS="avc1.42c01e,mp4a.40.2"\n`;
    m3u8 += `${name}/index.m3u8\n\n`;
  }

  return m3u8;
}
// // types/index.ts — shared types across the frontend

// export interface Participant {
//   socketId:     string
//   name:         string
//   stream?:      MediaStream   // video stream → shown in <video>
//   audioStream?: MediaStream   // audio stream → played in <audio> (remote only)
//   audioMuted:   boolean
//   videoOff:     boolean
//   isLocal:      boolean
// }

// export interface WSMessage {
//   type:    string
//   payload: Record<string, any>
// }

// export type ConnectionState =
//   | 'idle'
//   | 'connecting'
//   | 'connected'
//   | 'error'
//   | 'disconnected'


//phase 3

export interface Participant {
  socketId:     string
  name:         string
  stream?:      MediaStream
  audioStream?: MediaStream
  audioMuted:   boolean
  videoOff:     boolean
  isLocal:      boolean
}

export interface WSMessage {
  type:    string
  payload: Record<string, any>
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'   // phase 3: lost connection, auto-retrying
  | 'error'
  | 'disconnected'


  // streaming 
  
export type UploadStatus =
  | "idle"
  | "validating"
  | "creating-record" // POST /api/videos in flight
  | "uploading"
  | "paused"
  | "success"
  | "error";
 
export interface UploadState {
  status: UploadStatus;
  /** 0–100. Only meaningful while status is "uploading" or "paused". */
  progressPercent: number;
  /** Bytes uploaded so far — used to show "120 MB / 500 MB" style detail. */
  bytesUploaded: number;
  bytesTotal: number;
  videoId: string | null;
  errorMessage: string | null;
  /** True once we've detected and resumed a previous incomplete upload. */
  resumedFromPrevious: boolean;
}
 
export const INITIAL_UPLOAD_STATE: UploadState = {
  status: "idle",
  progressPercent: 0,
  bytesUploaded: 0,
  bytesTotal: 0,
  videoId: null,
  errorMessage: null,
  resumedFromPrevious: false,
};
 


// lib/types.ts
//
// Mirrors the backend's CachedVideoEntry shape exactly (see
// video-streaming-backend/src/lib/video-cache.ts). filesize stays a
// string here too — it crossed JSON as a string on the backend
// specifically because BigInt can't survive JSON.stringify, so we
// keep that shape rather than re-parsing it back into a number we'd
// have to handle precision-loss risk for.

export interface VideoListEntry {
  id: string;
  filename: string;
  filesize: string;
  duration: number | null;
  playbackUrl: string;
  createdAt: string;
}

export interface VideoListResponse {
  videos: VideoListEntry[];
  source: "cache" | "db";
}
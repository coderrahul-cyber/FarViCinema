// useVideoUpload.ts
//
// All upload logic lives here, separate from rendering (VideoUploader.tsx).
// Handles: pre-flight DB record creation, the TUS upload itself,
// progress tracking, pause/resume, and — the key feature for this
// chunk — detecting and resuming a previous incomplete upload via
// tus-js-client's findPreviousUploads().

import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { validateFile, FileValidationError } from "../libs/validateFile";
import { INITIAL_UPLOAD_STATE, type UploadState } from "../types/index";

const TUS_ENDPOINT =
  process.env.NEXT_PUBLIC_TUS_ENDPOINT ?? "http://localhost:3000/uploads";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB — see doc notes: too small (<5MB) and S3 rejects parts
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000]; // auto-retry on dropped connection

async function createVideoRecord(file: File): Promise<string> {
  const res = await fetch(`${API_BASE}/api/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      filesize: file.size,
      mimetype: file.type,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to create video record (${res.status})`);
  }

  const { videoId } = await res.json();
  return videoId;
}

export function useVideoUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_UPLOAD_STATE);

  // tus.Upload instance, kept across renders so pause/resume can
  // reach the in-flight upload without re-creating it.
  const uploadRef = useRef<tus.Upload | null>(null);

  const reset = useCallback(() => {
    uploadRef.current = null;
    setState(INITIAL_UPLOAD_STATE);
  }, []);

  const startUpload = useCallback(async (file: File) => {
    // Step 1: client-side validation
    try {
      validateFile(file);
    } catch (err) {
      if (err instanceof FileValidationError) {
        setState((s) => ({ ...s, status: "error", errorMessage: err.message }));
        return;
      }
      throw err;
    }

    setState((s) => ({ ...s, status: "creating-record", errorMessage: null }));

    // Step 2: pre-flight — create the DB record, get a videoId
    let videoId: string;
    try {
      videoId = await createVideoRecord(file);
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Failed to start upload",
      }));
      return;
    }

    setState((s) => ({
      ...s,
      status: "uploading",
      videoId,
      bytesTotal: file.size,
    }));

    // Step 3: TUS resumable upload
    const upload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      chunkSize: CHUNK_SIZE,
      retryDelays: RETRY_DELAYS,

      metadata: {
        filename: file.name,
        filetype: file.type,
      },

      headers: {
        "x-video-id": videoId,
      },

      // Required so resuming works across page reloads — tus-js-client
      // uses this to recognize "this is the same logical upload" when
      // findPreviousUploads() runs later, even for a freshly-selected
      // File object that points at the same underlying file on disk.
      fingerprint: async (file) => {
        return `video-upload-${file.name}-${file.size}-${(file as File).lastModified}`;
      },

      onProgress(bytesUploaded, bytesTotal) {
        setState((s) => ({
          ...s,
          bytesUploaded,
          bytesTotal,
          progressPercent: Math.round((bytesUploaded / bytesTotal) * 100),
        }));
      },

      onSuccess() {
        setState((s) => ({ ...s, status: "success", progressPercent: 100 }));
      },

      onError(err) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: err.message || "Upload failed",
        }));
      },
    });

    uploadRef.current = upload;

    // The key resumability feature: check IndexedDB/localStorage (tus-js-client's
    // own storage) for a previous incomplete upload of this same file —
    // matched via the fingerprint above — and resume from that byte
    // offset instead of restarting from zero.
    const previousUploads = await upload.findPreviousUploads();
    if (previousUploads.length > 0) {
      upload.resumeFromPreviousUpload(previousUploads[0]);
      setState((s) => ({ ...s, resumedFromPrevious: true }));
    }

    upload.start();
  }, []);

  const pauseUpload = useCallback(() => {
    uploadRef.current?.abort();
    setState((s) => ({ ...s, status: "paused" }));
  }, []);

  const resumeUpload = useCallback(() => {
    if (!uploadRef.current) return;
    setState((s) => ({ ...s, status: "uploading" }));
    uploadRef.current.start();
  }, []);

  return { state, startUpload, pauseUpload, resumeUpload, reset };
}
"use client";

// VideoUploader.tsx
//
// Top-level component. Orchestration only — actual upload logic
// lives in useVideoUpload.ts, the progress bar UI lives in
// UploadProgressBar.tsx. This file just wires them together and
// renders the right thing for each status.

import { useRef } from "react";
import { useVideoUpload } from "../../hooks/useVideoUpload";
import { UploadProgressBar } from "../../components/videoUpload/UploadProgressBar";

export function VideoUploader() {
  const { state, startUpload, pauseUpload, resumeUpload, reset } = useVideoUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void startUpload(file);
    }
  }

  function handlePickAnother() {
    reset();
    fileInputRef.current?.click();
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Upload video</h2>

      {/* Idle: show the file picker */}
      {state.status === "idle" && (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-8 text-center hover:border-blue-400">
          <span className="text-sm text-gray-600">
            Click to choose a video, or drag one here
          </span>
          <span className="mt-1 text-xs text-gray-400">MP4, MOV, AVI, WebM — up to 10 GB</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      )}

      {/* Creating the DB record before the TUS upload starts */}
      {state.status === "creating-record" && (
        <p className="text-sm text-gray-600">Preparing upload…</p>
      )}

      {/* Uploading or paused — show progress + controls */}
      {(state.status === "uploading" || state.status === "paused") && (
        <div className="space-y-3">
          {state.resumedFromPrevious && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Resumed from a previous incomplete upload.
            </p>
          )}
          <UploadProgressBar
            percent={state.progressPercent}
            bytesUploaded={state.bytesUploaded}
            bytesTotal={state.bytesTotal}
            paused={state.status === "paused"}
          />
          <div className="flex gap-2">
            {state.status === "uploading" ? (
              <button
                onClick={pauseUpload}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={resumeUpload}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Resume
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success */}
      {state.status === "success" && (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-green-700">
            Upload complete — your video is being processed.
          </p>
          <p className="text-xs text-gray-400">videoId: {state.videoId}</p>
          <button
            onClick={handlePickAnother}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Upload another
          </button>
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-red-700">{state.errorMessage}</p>
          <button
            onClick={handlePickAnother}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
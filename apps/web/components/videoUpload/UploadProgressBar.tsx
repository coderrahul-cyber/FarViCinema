// UploadProgressBar.tsx
//
// Purely presentational — no upload logic here. Takes numbers in,
// renders pixels out. Keeping this dumb makes it trivial to reuse
// for other progress UIs later (e.g. transcoding progress).

import { formatBytes } from "../../libs/validateFile";

interface UploadProgressBarProps {
  percent: number;
  bytesUploaded: number;
  bytesTotal: number;
  paused?: boolean;
}

export function UploadProgressBar({
  percent,
  bytesUploaded,
  bytesTotal,
  paused = false,
}: UploadProgressBarProps) {
  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            paused ? "bg-amber-400" : "bg-blue-600"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-sm text-gray-500">
        <span>
          {formatBytes(bytesUploaded)} / {formatBytes(bytesTotal)}
        </span>
        <span>{percent}%{paused ? " (paused)" : ""}</span>
      </div>
    </div>
  );
}
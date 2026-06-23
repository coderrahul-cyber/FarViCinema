// validateFile.ts
//
// Step 1 from the pipeline doc: validate before any byte is sent.
// This is a UX convenience only — the doc is explicit that
// `file.type` can be spoofed (it's derived from the file extension
// by the browser), so the backend MUST re-validate independently.
// Never treat a passing client-side check as a security boundary.

export const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/x-msvideo", // .avi
  "video/webm",
] as const;

export const MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export class FileValidationError extends Error {}

export function validateFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
    throw new FileValidationError(
      `Unsupported format: ${file.type || "unknown"}. Accepted: MP4, MOV, AVI, WebM`,
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    const gb = (file.size / 1e9).toFixed(1);
    throw new FileValidationError(`File too large: ${gb} GB. Max is 10 GB`);
  }

  if (file.size === 0) {
    throw new FileValidationError("File is empty");
  }
}

/** Formats bytes as a human string, e.g. "482.3 MB". Used for progress UI. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
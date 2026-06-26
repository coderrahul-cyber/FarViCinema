// VideoStatus used to be imported from "@prisma/client". Now that
// Postgres/Prisma is removed for local testing, this is the single
// source of truth for the state machine instead:
//
//   awaiting_upload -> uploading -> processing -> ready
//                                              \-> failed

export type VideoStatus =
  | "awaiting_upload"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export interface VideoRecord {
  id: string;
  userId: string | null;
  filename: string;
  filesize: bigint;
  mimetype: string;
  duration: number | null;
  status: VideoStatus;
  jobId: string | null;
  playbackUrl: string | null;
  /**
   * The TUS-generated upload ID, which is also the literal S3 object
   * key in the raw-uploads bucket (S3Store has no separate key/prefix
   * option — the upload ID IS the key). Null until onUploadCreate
   * fires. The future transcoding worker reads this to know which
   * object to download.
   */
  s3Key: string | null;
  createdAt: Date;
  updatedAt: Date;
}
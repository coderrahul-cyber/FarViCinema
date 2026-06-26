// src/lib/types.ts
//
// The job payload contract. Kept deliberately minimal for this
// chunk: just enough for the worker to know which S3 object to
// fetch. The worker is responsible for looking up anything else it
// needs (e.g. the backend's API for video metadata) — we don't
// duplicate that data into the job itself.

export interface TranscodeJobData {
  videoId: string;
  s3Key: string;
}
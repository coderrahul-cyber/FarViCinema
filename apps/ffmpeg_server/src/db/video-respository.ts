// // src/db/video-repository.ts
// //
// // Same function signatures as before — routes/videos.ts and
// // tus/hooks.ts call these without knowing or caring that the
// // storage underneath is an in-memory Map instead of Postgres.
// // Swapping back to a real DB later means rewriting only this file.
// //
// // NOTE: backed by src/db/memory-store.ts — not persistent across
// // restarts. See that file's header comment for details.

// import {
//   createVideoRecord,
//   findVideoRecordById,
//   updateVideoRecordStatus,
//   setVideoRecordS3Key,
//   setVideoRecordJobId,
// } from "./memory-store";
// import type { VideoStatus } from "./types";

// export interface CreateVideoInput {
//   filename: string;
//   filesize: bigint;
//   mimetype: string;
//   userId?: string;
// }

// export async function createVideo(input: CreateVideoInput) {
//   return createVideoRecord(input);
// }

// export async function findVideoById(id: string) {
//   return findVideoRecordById(id);
// }

// export async function updateVideoStatus(id: string, status: VideoStatus) {
//   const updated = updateVideoRecordStatus(id, status);
//   if (!updated) {
//     throw new Error(`No video found with id ${id}`);
//   }
//   return updated;
// }

// export async function setVideoS3Key(id: string, s3Key: string) {
//   const updated = setVideoRecordS3Key(id, s3Key);
//   if (!updated) {
//     throw new Error(`No video found with id ${id}`);
//   }
//   return updated;
// }

// export async function setVideoJobId(id: string, jobId: string) {
//   const updated = setVideoRecordJobId(id, jobId);
//   if (!updated) {
//     throw new Error(`No video found with id ${id}`);
//   }
//   return updated;
// }


//db 

// src/db/video-repository.ts
//
// All Prisma queries for the Video model live here. Routes and the
// TUS hooks call these functions instead of importing `prisma`
// directly. Same exported function names/signatures as the earlier
// in-memory version — routes/videos.ts and tus/hooks.ts needed zero
// changes when swapping this back to a real DB.

import { prisma } from "./client";
import type { VideoStatus } from "@repo/db/prisma";

export interface CreateVideoInput {
  filename: string;
  filesize: bigint;
  mimetype: string;
  userId?: string;
}

export async function createVideo(input: CreateVideoInput) {
  return prisma.video.create({
    data: {
      filename: input.filename,
      filesize: input.filesize,
      mimetype: input.mimetype,
      userId: input.userId ?? null,
      status: "awaiting_upload",
    },
  });
}

export async function findVideoById(id: string) {
  return prisma.video.findUnique({ where: { id } });
}

export async function updateVideoStatus(id: string, status: VideoStatus) {
  return prisma.video.update({
    where: { id },
    data: { status },
  });
}

export async function setVideoS3Key(id: string, s3Key: string) {
  return prisma.video.update({
    where: { id },
    data: { s3Key },
  });
}

export async function setVideoJobId(id: string, jobId: string) {
  return prisma.video.update({
    where: { id },
    data: { status: "processing", jobId },
  });
}
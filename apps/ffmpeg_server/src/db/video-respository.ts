

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

export async function setVideoReady(id: string, playbackUrl: string) {
  return prisma.video.update({
    where: { id },
    data: { status: "ready", playbackUrl },
  });
}

export async function setVideoFailed(id: string, errorMessage: string) {
  return prisma.video.update({
    where: { id },
    data: { status: "failed", errorMessage: errorMessage.slice(0, 1000) },
  });
}

export async function setVideoJobId(id: string, jobId: string) {
  return prisma.video.update({
    where: { id },
    data: { status: "processing", jobId },
  });
}

// New — used by GET /api/videos (see routes/video-list.ts) on a
// cache miss. Only selects the fields the list page actually needs,
// not the whole row.
export async function findReadyVideos() {
  return prisma.video.findMany({
    where: { status: "ready" },
    select: {
      id: true,
      filename: true,
      filesize: true,
      duration: true,
      playbackUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
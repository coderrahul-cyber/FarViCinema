// // Called by the queuing-system worker (a separate process/repo) once
// // a transcoding job finishes or permanently fails. This is the only
// // way queuing-system communicates a result back — it has no direct
// // database access by design (see lib/queue-client.ts's header
// // comment on the architecture).
// //
// // No auth on this yet, same as everywhere else in this chunk — see
// // the TODO(auth) markers elsewhere. Before going to production this
// // needs at minimum a shared-secret header so an arbitrary caller
// // can't mark videos ready/failed.
import { findVideoById, setVideoReady, setVideoFailed } from "../db/video-respository";
import { invalidateVideoListCache } from "../lib/video-cache";

interface UpdateStatusRequestBody {
  status?: "ready" | "failed";
  playbackUrl?: string;
  errorMessage?: string;
}

export async function updateVideoStatusRoute(req: Request, videoId: string): Promise<Response> {
  const video = await findVideoById(videoId);
  if (!video) {
    return Response.json({ error: "Video not found" }, { status: 404 });
  }

  let body: UpdateStatusRequestBody;
  try {
    body = (await req.json()) as UpdateStatusRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status === "ready") {
    if (!body.playbackUrl || typeof body.playbackUrl !== "string") {
      return Response.json(
        { error: "playbackUrl is required when status is 'ready'" },
        { status: 400 },
      );
    }
    const updated = await setVideoReady(videoId, body.playbackUrl);

    // Invalidate rather than patch the cached list in place — the
    // next GET /api/videos rebuilds it from Postgres, which now
    // includes this video.
    await invalidateVideoListCache();

    return Response.json({ id: updated.id, status: updated.status });
  }

  if (body.status === "failed") {
    const updated = await setVideoFailed(videoId, body.errorMessage ?? "Unknown error");

    // Only matters if this video was previously "ready" and is now
    // failing again (e.g. a manual re-transcode that broke) — keeps
    // the cached list from showing a video that's no longer playable.
    await invalidateVideoListCache();

    return Response.json({ id: updated.id, status: updated.status });
  }

  return Response.json(
    { error: "status must be 'ready' or 'failed'" },
    { status: 400 },
  );
}
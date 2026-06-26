// The producer's HTTP surface. The main backend's onUploadFinish
// hook calls POST /jobs here once a video upload completes. This
// process's only responsibility is "accept the request, validate
// it, push it into Redis, respond" — it never touches MinIO or runs
// any transcoding itself. That's the worker's job, in a completely
// separate process (see worker/worker.ts).

import { env } from "../config/env";
import { transcodeQueue } from "./queue";
import type { TranscodeJobData } from "../lib/types";

interface CreateJobRequestBody {
  videoId?: string;
  s3Key?: string;
}

function isValidBody(body: CreateJobRequestBody): body is Required<CreateJobRequestBody> {
  return (
    typeof body.videoId === "string" &&
    body.videoId.length > 0 &&
    typeof body.s3Key === "string" &&
    body.s3Key.length > 0
  );
}

Bun.serve({
  port: env.PRODUCER_PORT,

  routes: {
    "/health": () => Response.json({ ok: true }),

    "/jobs": {
      POST: async (req) => {
        let body: CreateJobRequestBody;
        try {
          body = (await req.json()) as CreateJobRequestBody;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (!isValidBody(body)) {
          return Response.json(
            { error: "videoId and s3Key are both required" },
            { status: 400 },
          );
        }

        const jobData: TranscodeJobData = {
          videoId: body.videoId,
          s3Key: body.s3Key,
        };

        try {
          // jobId set explicitly to videoId — makes the job
          // idempotent. If onUploadFinish somehow fires twice for
          // the same video (e.g. a client retry), BullMQ will not
          // create a second duplicate job for an id that's already
          // present in the queue.
          const job = await transcodeQueue.add("transcode", jobData, {
            jobId: jobData.videoId,
          });

          return Response.json({ jobId: job.id, queued: true }, { status: 201 });
        } catch (err) {
          console.error("Failed to enqueue job:", err);
          return Response.json({ error: "Failed to enqueue job" }, { status: 500 });
        }
      },
    },

    // Quick visibility into queue depth without needing a separate
    // dashboard — handy while testing this chunk.
    "/jobs/stats": {
      GET: async () => {
        const counts = await transcodeQueue.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed",
        );
        return Response.json(counts);
      },
    },
  },

  error(err) {
    console.error("Producer server error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  },
});

console.log(`Producer server running at http://localhost:${env.PRODUCER_PORT}`);
console.log(`Queue: "${env.QUEUE_NAME}"`);
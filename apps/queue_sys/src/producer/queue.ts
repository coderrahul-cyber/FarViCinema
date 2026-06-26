// The Queue instance — this is what actually writes jobs into
// Redis. Only the producer process touches this file; the worker
// has its own separate Worker instance in worker/worker.ts.

import { Queue } from "bullmq";
import { createProducerConnection } from "../lib/redis-connection";
import { env } from "../config/env";
import type { TranscodeJobData } from "../lib/types";

const connection = createProducerConnection();

export const transcodeQueue = new Queue<TranscodeJobData>(env.QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    // Without these, every completed/failed job stays in Redis
    // forever and memory grows unbounded. Keep a bounded recent
    // history instead — enough to debug, not enough to leak memory.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
// src/index.ts
//
// Entry point. Wires routes together and starts the server.
// Deliberately kept thin — actual logic for each concern lives in
// its own module (config/, db/, lib/, tus/, routes/) so this file
// stays readable as the app grows.

import { env } from "./config/env";
import { tusServer } from "./tus/server";
import { createVideoRoute } from "./routes/video";
import { testUploadRoute, checkTestUploadRoute } from "./routes/test-upload";
import { withCors, corsPreflightResponse } from "./lib/cors";

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: 120, 
  maxRequestBodySize: 1024 * 1024 * 1024, // 1 GiB

  routes: {
    "/health": () => Response.json({ ok: true }),

    // Step 2: pre-flight — creates the video record before upload starts.
    "/api/videos": {
      OPTIONS: corsPreflightResponse,
      POST: async (req) => withCors(await createVideoRoute(req)),
    },

    // Chunk 1 — independent MinIO connectivity sanity check.
    "/api/test-upload": {
      OPTIONS: corsPreflightResponse,
      POST: async () => withCors(await testUploadRoute()),
    },
    "/api/test-upload/:videoId": {
      OPTIONS: corsPreflightResponse,
      GET: async (req) => withCors(await checkTestUploadRoute(req.params.videoId)),
    },


    "/uploads": {
      OPTIONS: corsPreflightResponse,
      POST: async (req) => withCors(await tusServer.handleWeb(req)),
    },
    "/uploads/*": {
      OPTIONS: corsPreflightResponse,
      PATCH: async (req) => withCors(await tusServer.handleWeb(req)),
      HEAD: async (req) => withCors(await tusServer.handleWeb(req)),
      DELETE: async (req) => withCors(await tusServer.handleWeb(req)),
      GET: async (req) => withCors(await tusServer.handleWeb(req)),
    },
  },

  error(err) {
    console.error("Server error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
console.log(`TUS upload endpoint: http://localhost:${server.port}/uploads`);
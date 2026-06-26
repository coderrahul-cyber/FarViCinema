import { env } from "./config/env";
import { tusServer } from "./tus/server";
import { createVideoRoute } from "./routes/video";
import { updateVideoStatusRoute } from "./routes/video-status";
import { listVideosRoute } from "./routes/video-list";
import { testUploadRoute, checkTestUploadRoute } from "./routes/test-upload";
import { withCors, corsPreflightResponse } from "./lib/cors";

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: 120, 
  maxRequestBodySize: 1024 * 1024 * 1024, 
  routes: {
    "/health": () => Response.json({ ok: true }),
    "/api/videos": {
      OPTIONS: corsPreflightResponse,
      POST: async (req) => withCors(await createVideoRoute(req)),
      GET: async () => withCors(await listVideosRoute()),
    },
    "/api/videos/:videoId/status": {
      OPTIONS: corsPreflightResponse,
      PATCH: async (req) =>
        withCors(await updateVideoStatusRoute(req, req.params.videoId)),
    },
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
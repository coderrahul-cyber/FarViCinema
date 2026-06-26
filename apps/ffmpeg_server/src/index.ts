// // // src/index.ts
// // //
// // // Entry point. Wires routes together and starts the server.
// // // Deliberately kept thin — actual logic for each concern lives in
// // // its own module (config/, db/, lib/, tus/, routes/) so this file
// // // stays readable as the app grows.

// // import { env } from "./config/env";
// // import { tusServer } from "./tus/server";
// // import { createVideoRoute } from "./routes/video";
// // import { testUploadRoute, checkTestUploadRoute } from "./routes/test-upload";
// // import { withCors, corsPreflightResponse } from "./lib/cors";

// // const server = Bun.serve({
// //   port: env.PORT,
// //   idleTimeout: 120, 
// //   maxRequestBodySize: 1024 * 1024 * 1024, // 1 GiB

// //   routes: {
// //     "/health": () => Response.json({ ok: true }),

// //     // Step 2: pre-flight — creates the video record before upload starts.
// //     "/api/videos": {
// //       OPTIONS: corsPreflightResponse,
// //       POST: async (req) => withCors(await createVideoRoute(req)),
// //     },

// //     // Chunk 1 — independent MinIO connectivity sanity check.
// //     "/api/test-upload": {
// //       OPTIONS: corsPreflightResponse,
// //       POST: async () => withCors(await testUploadRoute()),
// //     },
// //     "/api/test-upload/:videoId": {
// //       OPTIONS: corsPreflightResponse,
// //       GET: async (req) => withCors(await checkTestUploadRoute(req.params.videoId)),
// //     },


// //     "/uploads": {
// //       OPTIONS: corsPreflightResponse,
// //       POST: async (req) => withCors(await tusServer.handleWeb(req)),
// //     },
// //     "/uploads/*": {
// //       OPTIONS: corsPreflightResponse,
// //       PATCH: async (req) => withCors(await tusServer.handleWeb(req)),
// //       HEAD: async (req) => withCors(await tusServer.handleWeb(req)),
// //       DELETE: async (req) => withCors(await tusServer.handleWeb(req)),
// //       GET: async (req) => withCors(await tusServer.handleWeb(req)),
// //     },
// //   },

// //   error(err) {
// //     console.error("Server error:", err);
// //     return Response.json({ error: "Internal server error" }, { status: 500 });
// //   },
// // });

// // console.log(`Server running at http://localhost:${server.port}`);
// // console.log(`TUS upload endpoint: http://localhost:${server.port}/uploads`);


// //new after the queue
// // src/index.ts
// //
// // Entry point. Wires routes together and starts the server.
// // Deliberately kept thin — actual logic for each concern lives in
// // its own module (config/, db/, lib/, tus/, routes/) so this file
// // stays readable as the app grows.

// import { env } from "./config/env";
// import { tusServer } from "./tus/server";
// import { createVideoRoute } from "./routes/video";
// import { updateVideoStatusRoute } from "./routes/video-status";
// import { testUploadRoute, checkTestUploadRoute } from "./routes/test-upload";
// import { withCors, corsPreflightResponse } from "./lib/cors";

// const server = Bun.serve({
//   port: env.PORT,

//   // Bun's default idleTimeout is 10 seconds of inactivity before a
//   // request is silently aborted — no error surfaced to either side,
//   // it just hangs from the client's perspective. A 10MB PATCH chunk
//   // should normally complete well under that, but a slow disk/network
//   // hop through MinIO (or a debugger pause, or a dev-machine hiccup)
//   // can exceed it. Raised generously since this is local dev with
//   // large video files.
//   idleTimeout: 120, // seconds

//   // Per-request body size cap. Default is ~128MB — fine for our 10MB
//   // chunks, but raised here as a safety margin in case CHUNK_SIZE is
//   // increased later on the frontend.
//   maxRequestBodySize: 1024 * 1024 * 1024, // 1 GiB

//   routes: {
//     "/health": () => Response.json({ ok: true }),

//     // Step 2: pre-flight — creates the video record before upload starts.
//     "/api/videos": {
//       OPTIONS: corsPreflightResponse,
//       POST: async (req) => withCors(await createVideoRoute(req)),
//     },

//     // Called by the queuing-system worker (separate process/repo)
//     // once a transcoding job finishes or permanently fails.
//     "/api/videos/:videoId/status": {
//       OPTIONS: corsPreflightResponse,
//       PATCH: async (req) =>
//         withCors(await updateVideoStatusRoute(req, req.params.videoId)),
//     },

//     // Chunk 1 — independent MinIO connectivity sanity check.
//     "/api/test-upload": {
//       OPTIONS: corsPreflightResponse,
//       POST: async () => withCors(await testUploadRoute()),
//     },
//     "/api/test-upload/:videoId": {
//       OPTIONS: corsPreflightResponse,
//       GET: async (req) => withCors(await checkTestUploadRoute(req.params.videoId)),
//     },

//     // Step 3: TUS resumable upload protocol.
//     //
//     // Two route entries are required, not one:
//     //   "/uploads"   — Creation extension: browser POSTs here once
//     //                  to start a new upload (no upload-id exists yet).
//     //   "/uploads/*" — every subsequent PATCH (send next chunk),
//     //                  HEAD (resume: "how many bytes do you have?"),
//     //                  and DELETE (cancel) goes to the per-upload URL
//     //                  TUS returned in the Location header from that
//     //                  initial POST.
//     //
//     // tusServer.handleWeb is @tus/server 2.0's Request/Response-based
//     // handler — built specifically for Web-standard runtimes like
//     // Bun, so it slots directly into Bun.serve's routes table with
//     // no Node http bridge needed.
//     //
//     // IMPORTANT: every handleWeb() response MUST be wrapped in
//     // withCors, same as every other route below. This was missed
//     // initially — the POST response carries the Location header
//     // (the URL for all subsequent chunks) and PATCH/HEAD responses
//     // carry Upload-Offset, but without Access-Control-Expose-Headers
//     // the browser receives these headers over the wire yet hides
//     // them from JS. tus-js-client can't read Location, so it has no
//     // URL to PATCH the next chunk to — this presented as a silent
//     // stall (no thrown error in either console) rather than a clean
//     // failure, which is what made it tricky to spot.
//     "/uploads": {
//       OPTIONS: corsPreflightResponse,
//       POST: async (req) => withCors(await tusServer.handleWeb(req)),
//     },
//     "/uploads/*": {
//       OPTIONS: corsPreflightResponse,
//       PATCH: async (req) => withCors(await tusServer.handleWeb(req)),
//       HEAD: async (req) => withCors(await tusServer.handleWeb(req)),
//       DELETE: async (req) => withCors(await tusServer.handleWeb(req)),
//       GET: async (req) => withCors(await tusServer.handleWeb(req)),
//     },
//   },

//   error(err) {
//     console.error("Server error:", err);
//     return Response.json({ error: "Internal server error" }, { status: 500 });
//   },
// });

// console.log(`Server running at http://localhost:${server.port}`);
// console.log(`TUS upload endpoint: http://localhost:${server.port}/uploads`);


//new after streaming 
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
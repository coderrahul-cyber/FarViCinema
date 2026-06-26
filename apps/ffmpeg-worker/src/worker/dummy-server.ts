// src/worker/dummy-server.ts
//
// Stands in for "the real work" while we prove the queue itself
// works. Run this as its own process (`bun run dummy-server`)
// alongside the producer and worker. Every job the worker picks up
// gets POSTed here — if you see these logs, the full chain
// (producer's HTTP endpoint -> Redis -> worker -> here) is proven
// end to end.

const PORT = Number(process.env.DUMMY_SERVER_PORT ?? 5000);

Bun.serve({
  port: PORT,

  routes: {
    "/health": () => Response.json({ ok: true }),

    "/process": {
      POST: async (req) => {
        const body = (await req.json().catch(() => null)) as
          | { videoId?: string; s3Key?: string }
          | null;

        console.log("[dummy-server] received job:", body);

        // Simulate some processing time so you can actually see jobs
        // sitting in "active" state if you poll /jobs/stats on the
        // producer while this runs.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log("[dummy-server] finished \"processing\":", body?.videoId);

        return Response.json({ received: true, videoId: body?.videoId });
      },
    },
  },
});

console.log(`Dummy server running at http://localhost:${PORT}`);
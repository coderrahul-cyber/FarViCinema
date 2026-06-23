// src/lib/cors.ts
//
// The Next.js frontend runs on a different origin (localhost:3001)
// than this API (localhost:3000), so every response needs CORS
// headers or the browser blocks it before your code ever sees it.
//
// TUS in particular needs its own custom headers exposed
// (Upload-Offset, Upload-Length, etc.) — without Access-Control-
// Expose-Headers, tus-js-client can't read them from the response
// and resumability silently breaks.

import { env } from "../config/env";

const TUS_RESPONSE_HEADERS = [
  "Location",
  "Upload-Offset",
  "Upload-Length",
  "Tus-Resumable",
  "Tus-Version",
  "Tus-Max-Size",
  "Tus-Extension",
  "Upload-Metadata",
];

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Video-Id, Upload-Offset, Upload-Length, Tus-Resumable, Upload-Metadata, Upload-Concat",
    "Access-Control-Expose-Headers": TUS_RESPONSE_HEADERS.join(", "),
    "Access-Control-Max-Age": "86400",
  };
}

/** Adds CORS headers to a Response by mutating its headers in place. */
export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(corsHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

/** Standard empty 204 response for OPTIONS preflight requests. */
export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
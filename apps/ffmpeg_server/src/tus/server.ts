
// Assembles the @tus/server Server instance: wires the MinIO-backed
// S3Store (store.ts) together with the access-control / DB hooks
// (hooks.ts). Imported by index.ts and mounted directly into
// Bun.serve's routes table via server.handleWeb — see index.ts for
// why that's the correct integration point for Bun specifically.
//
// IMPORTANT — no namingFunction here, on purpose.
//
// An earlier version of this file set namingFunction to return
// `raw/${videoId}`, intending that to become the S3 object key.
// That's wrong: the value returned by namingFunction becomes the
// upload's ID, which is embedded directly in the upload URL
// (`/uploads/<id>`). @tus/server extracts the ID back out of the
// URL on every subsequent PATCH/HEAD/DELETE using the regex
// `/([^/]+)\/?$/` — which only captures the LAST path segment.
// "raw/<uuid>" round-trips through one slash-eating regex and comes
// back as just "<uuid>", a different ID than the one the upload was
// created with. Every chunk after the first then 404s, because the
// store has no record of an upload with that (truncated) ID.
//
// S3Store also has no separate "key" concept — the upload ID IS the
// S3 object key, with no prefix option (confirmed against the
// installed @tus/s3-store's Options type, which exposes no naming
// hook at all). So there is no slash-safe way to bake `raw/{videoId}`
// in via this mechanism.
//
// Fix: let TUS generate its own (safe, slash-free) random ID. We
// separately track videoId -> upload ID ourselves (see hooks.ts),
// which is enough for the future worker to find the right S3 object.

import { Server } from "@tus/server";
import { tusDataStore } from "./store";
import { onIncomingRequest, onUploadFinish, onUploadCreate } from "./hooks";
import { MAX_SIZE_BYTES } from "../lib/video-validation";

export const tusServer = new Server({
  path: "/uploads",
  datastore: tusDataStore,
  maxSize: MAX_SIZE_BYTES,
  onIncomingRequest,
  onUploadCreate,
  onUploadFinish,
});
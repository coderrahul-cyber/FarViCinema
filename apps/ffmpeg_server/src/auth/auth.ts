
// The pipeline doc's TUS hooks call `verifyToken(token)` to resolve
// a Bearer token into a user, then check `video.userId === user.id`
// before accepting any upload bytes (this ownership check is the
// real security boundary in Step 3 of the doc — never skip it once
// real auth exists).
//
// For now there's no real auth system, so every request resolves
// to the same fake user. The function signature matches what real
// auth will look like, so routes/hooks calling `verifyToken()` will
// not need to change when real auth is wired in — only this file
// will.

export interface AuthUser {
  id: string;
  email: string;
}

const FAKE_USER: AuthUser = {
  id: "user_dev_stub",
  email: "dev@example.com",
};

/**
 * Resolves a Bearer token to a user.
 * STUB: ignores the token entirely and always returns the same fake user.
 * Throws if no token is present at all, so the "missing auth header"
 * code path is at least exercised the same way it will be in production.
 */
export async function verifyToken(token: string | undefined): Promise<AuthUser> {
  if (!token) {
    throw new Error("Missing Authorization header");
  }
  return FAKE_USER;
}

/** Extracts a Bearer token from a standard Authorization header value. */
export function extractBearerToken(authHeader: string | null): string | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  return authHeader.slice("Bearer ".length).trim() || undefined;
}
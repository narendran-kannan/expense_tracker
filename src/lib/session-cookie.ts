import type { NextRequest } from "next/server";

/**
 * Cheap session check for API routes that are only reachable from the
 * authenticated /debug page. `src/middleware.ts` also guards these paths; this
 * is defence in depth for direct calls to the route handlers.
 */
export function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("authjs.session-token") ||
      request.cookies.get("__Secure-authjs.session-token")
  );
}

import "server-only";

export function isTrustedOrigin(request: Request): boolean {
  const configuredURL = process.env.BETTER_AUTH_URL;

  if (!configuredURL) {
    throw new Error("BETTER_AUTH_URL is required.");
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    const trustedOrigin = new URL(configuredURL).origin;
    const suppliedOrigin = new URL(origin);

    // An Origin header must contain an origin, not a path or credentials.
    if (origin !== suppliedOrigin.origin) {
      return false;
    }

    return suppliedOrigin.origin === trustedOrigin;
  } catch {
    return false;
  }
}
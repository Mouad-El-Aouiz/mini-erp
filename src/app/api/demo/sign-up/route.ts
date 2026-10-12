import { demoRegistrationEnabled } from "@/lib/demo-config";
import { auth } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/request-origin";
import { demoSignupSchema } from "@/lib/validation/demo";
import { DemoRegistrationError, registerDemo } from "@/lib/demo-registration";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (!demoRegistrationEnabled()) return Response.json({ error: "Demo registration is unavailable." }, { status: 404, headers });
  if (!isTrustedOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers });
  if (await auth.api.getSession({ headers: request.headers })) return Response.json({ error: "Sign out before creating a demo." }, { status: 409, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Content-Type must be application/json." }, { status: 415, headers });
  // Reject large requests even when Content-Length is omitted or misleading.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Invalid request." }, { status: 400, headers });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); return Response.json({ error: "Request is too large." }, { status: 413, headers }); }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  let input: unknown;
  try { input = JSON.parse(buffer.toString("utf8")); }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400, headers }); }
  const parsed = demoSignupSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Use a valid name, email, 12–128 character password and accept the demo policy." }, { status: 422, headers });
  try {
    await registerDemo(parsed.data);
    return Response.json({ message: "Demo account created. Sign in to continue." }, { status: 201, headers });
  } catch (error) {
    if (error instanceof DemoRegistrationError) return Response.json({ error: error.message }, { status: error.status,
      headers: { ...headers, ...(error.status === 429 ? { "Retry-After": "3600" } : {}) } });
    console.error("Demo account provisioning failed.");
    return Response.json({ error: "Unable to create the demo. Try signing in before retrying." }, { status: 500, headers });
  }
}

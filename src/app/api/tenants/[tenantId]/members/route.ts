import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { listMembers, createMember } from "@/lib/member-data";
import { memberHeaders, memberErrorResponse, MemberRequestError, readMemberInput } from "@/lib/member-http";
import { pageNumberSchema } from "@/lib/validation/common";
import { createMemberSchema } from "@/lib/validation/member";
type Context = { params: Promise<{ tenantId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const access = await requireTenantAccess(tenantId, "ADMIN");
    const values = new URL(request.url).searchParams.getAll("page");
    const page = pageNumberSchema.safeParse(values.length === 0 ? undefined : values.length === 1 ? values[0] : values);
    if (!page.success) throw new MemberRequestError(400, "Invalid page number.");
    return Response.json(await listMembers(access, page.data), { headers: memberHeaders });
  } catch (error) { return memberErrorResponse(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new MemberRequestError(403, "Request origin is not allowed.");
    const { tenantId } = await params;
    const access = await requireTenantAccess(tenantId, "ADMIN");
    const member = await createMember(access, await readMemberInput(request, createMemberSchema));
    return Response.json({ member }, { status: 201, headers: memberHeaders });
  } catch (error) { return memberErrorResponse(error); }
}

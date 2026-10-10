import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { updateMember } from "@/lib/member-data";
import { memberHeaders, memberErrorResponse, MemberRequestError, readMemberInput } from "@/lib/member-http";
import { entityIdSchema } from "@/lib/validation/common";
import { updateMemberSchema } from "@/lib/validation/member";
type Context = { params: Promise<{ tenantId: string; membershipId: string }> };
export async function PUT(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new MemberRequestError(403, "Request origin is not allowed.");
    const { tenantId, membershipId } = await params;
    const access = await requireTenantAccess(tenantId, "ADMIN");
    const id = entityIdSchema.safeParse(membershipId);
    if (!id.success) throw new MemberRequestError(400, "Invalid member identifier.");
    const member = await updateMember(access, id.data.toLowerCase(), await readMemberInput(request, updateMemberSchema));
    return Response.json({ member }, { headers: memberHeaders });
  } catch (error) { return memberErrorResponse(error); }
}

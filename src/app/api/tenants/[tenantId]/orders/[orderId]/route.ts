import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { getDraft, updateDraft } from "@/lib/order-data";
import { orderErrorResponse, OrderRequestError, readOrderInput, privateHeaders } from "@/lib/order-http";
import { updateDraftSchema } from "@/lib/validation/order";
import { entityIdSchema } from "@/lib/validation/common";
type Context={params:Promise<{tenantId:string;orderId:string}>};
export async function GET(_request:Request,{params}:Context) {
  try {
    const {tenantId,orderId}=await params;
    const access=await requireTenantAccess(tenantId);
    if(!entityIdSchema.safeParse(orderId).success) throw new OrderRequestError(400,"Invalid order identifier.");
    return Response.json({order:await getDraft(access,orderId)},{headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}
export async function PUT(request:Request,{params}:Context) {
  try {
    if(!isTrustedOrigin(request)) throw new OrderRequestError(403,"Request origin is not allowed.");
    const {tenantId,orderId}=await params;
    const access=await requireTenantAccess(tenantId);
    if(!entityIdSchema.safeParse(orderId).success) throw new OrderRequestError(400,"Invalid order identifier.");
    return Response.json({order:await updateDraft(access,orderId,await readOrderInput(request,updateDraftSchema))},{headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}

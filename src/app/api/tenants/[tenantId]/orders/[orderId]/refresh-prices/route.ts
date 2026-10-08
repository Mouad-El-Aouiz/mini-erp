import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { refreshDraftPrices } from "@/lib/order-data";
import { orderErrorResponse, OrderRequestError, readOrderInput, privateHeaders } from "@/lib/order-http";
import { refreshPricesSchema } from "@/lib/validation/order";
import { entityIdSchema } from "@/lib/validation/common";
export async function POST(request:Request,{params}:{params:Promise<{tenantId:string;orderId:string}>}) {
  try {
    if(!isTrustedOrigin(request)) throw new OrderRequestError(403,"Request origin is not allowed.");
    const {tenantId,orderId}=await params;
    const access=await requireTenantAccess(tenantId);
    if(!entityIdSchema.safeParse(orderId).success) throw new OrderRequestError(400,"Invalid order identifier.");
    return Response.json({order:await refreshDraftPrices(access,orderId,await readOrderInput(request,refreshPricesSchema))},{headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}

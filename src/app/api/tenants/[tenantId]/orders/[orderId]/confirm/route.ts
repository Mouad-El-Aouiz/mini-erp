import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { confirmOrder } from "@/lib/order-data";
import { orderErrorResponse, OrderRequestError, readOrderInput, privateHeaders } from "@/lib/order-http";
import { confirmOrderSchema } from "@/lib/validation/order";
import { entityIdSchema } from "@/lib/validation/common";

type Context={params:Promise<{tenantId:string;orderId:string}>};
export async function POST(request:Request,{params}:Context) {
  try {
    if(!isTrustedOrigin(request)) throw new OrderRequestError(403,"Request origin is not allowed.");
    const {tenantId,orderId}=await params;
    const access=await requireTenantAccess(tenantId);
    if(!entityIdSchema.safeParse(orderId).success) throw new OrderRequestError(400,"Invalid order identifier.");
    return Response.json({order:await confirmOrder(access,orderId,await readOrderInput(request,confirmOrderSchema))},{headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}

import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { createDraft, listOrders } from "@/lib/order-data";
import { orderErrorResponse, OrderRequestError, readOrderInput, privateHeaders } from "@/lib/order-http";
import { createDraftSchema } from "@/lib/validation/order";
import { pageNumberSchema } from "@/lib/validation/common";
type Context={params:Promise<{tenantId:string}>};
export async function GET(request:Request,{params}:Context) {
  try {
    const access=await requireTenantAccess((await params).tenantId);
    const values=new URL(request.url).searchParams.getAll("page");
    const page=pageNumberSchema.safeParse(values.length===0?undefined:values.length===1?values[0]:values);
    if(!page.success) throw new OrderRequestError(400,"Invalid page number.");
    return Response.json(await listOrders(access,page.data),{headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}
export async function POST(request:Request,{params}:Context) {
  try {
    if(!isTrustedOrigin(request)) throw new OrderRequestError(403,"Request origin is not allowed.");
    const access=await requireTenantAccess((await params).tenantId);
    const order=await createDraft(access,await readOrderInput(request,createDraftSchema));
    return Response.json({order},{status:order.replayed?200:201,headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}

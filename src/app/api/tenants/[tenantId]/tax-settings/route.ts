import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { getTaxSettings, updateTaxSettings } from "@/lib/order-data";
import { orderErrorResponse, OrderRequestError, readOrderInput, privateHeaders } from "@/lib/order-http";
import { taxSettingsSchema } from "@/lib/validation/order";
type Context={params:Promise<{tenantId:string}>};
export async function GET(_request:Request,{params}:Context) {
  try {return Response.json(await getTaxSettings(await requireTenantAccess((await params).tenantId)),{headers:privateHeaders});}
  catch(error) {return orderErrorResponse(error);}
}
export async function PUT(request:Request,{params}:Context) {
  try {
    if(!isTrustedOrigin(request)) throw new OrderRequestError(403,"Request origin is not allowed.");
    const access=await requireTenantAccess((await params).tenantId,"ADMIN");
    return Response.json(await updateTaxSettings(access,await readOrderInput(request,taxSettingsSchema)),{headers:privateHeaders});
  } catch(error) {return orderErrorResponse(error);}
}

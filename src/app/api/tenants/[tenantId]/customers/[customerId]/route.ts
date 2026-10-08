import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { getCustomer, replaceCustomer } from "@/lib/customer-data";
import { customerErrorResponse, CustomerRequestError, privateHeaders, readCustomerInput } from "@/lib/customer-http";
import { customerIdSchema } from "@/lib/validation/customer";

type Context = { params: Promise<{ tenantId: string; customerId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId, customerId } = await params;
    const access = await requireTenantAccess(tenantId);
    if (!customerIdSchema.safeParse(customerId).success) throw new CustomerRequestError(400, "Invalid customer identifier.");
    return Response.json({ customer: await getCustomer(access, customerId) }, { headers: privateHeaders });
  } catch (error) { return customerErrorResponse(error); }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new CustomerRequestError(403, "Request origin is not allowed.");
    const { tenantId, customerId } = await params;
    const access = await requireTenantAccess(tenantId);
    if (!customerIdSchema.safeParse(customerId).success) throw new CustomerRequestError(400, "Invalid customer identifier.");
    const input = await readCustomerInput(request);
    return Response.json({ customer: await replaceCustomer(access, customerId, input) }, { headers: privateHeaders });
  } catch (error) { return customerErrorResponse(error); }
}

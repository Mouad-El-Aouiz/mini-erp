import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { createCustomer, listCustomers } from "@/lib/customer-data";
import { customerErrorResponse, CustomerRequestError, privateHeaders, readCustomerInput } from "@/lib/customer-http";
import { customerPageSchema } from "@/lib/validation/customer";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const access = await requireTenantAccess(tenantId);
    const values = new URL(request.url).searchParams.getAll("page");
    const page = customerPageSchema.safeParse(values.length === 0 ? undefined : values.length === 1 ? values[0] : values);
    if (!page.success) throw new CustomerRequestError(400, "Invalid page number.");
    return Response.json(await listCustomers(access, page.data), { headers: privateHeaders });
  } catch (error) { return customerErrorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new CustomerRequestError(403, "Request origin is not allowed.");
    const { tenantId } = await params;
    const access = await requireTenantAccess(tenantId);
    const input = await readCustomerInput(request);
    const customer = await createCustomer(access, input);
    return Response.json({ customer }, { status: 201, headers: privateHeaders });
  } catch (error) { return customerErrorResponse(error); }
}

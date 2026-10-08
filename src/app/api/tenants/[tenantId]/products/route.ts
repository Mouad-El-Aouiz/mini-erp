import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { createProduct, listProducts } from "@/lib/product-data";
import { productErrorResponse, ProductRequestError, privateHeaders, readProductInput } from "@/lib/product-http";
import { pageNumberSchema as productPageSchema } from "@/lib/validation/common";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const access = await requireTenantAccess(tenantId);
    const values = new URL(request.url).searchParams.getAll("page");
    const page = productPageSchema.safeParse(values.length === 0 ? undefined : values.length === 1 ? values[0] : values);
    if (!page.success) throw new ProductRequestError(400, "Invalid page number.");
    return Response.json(await listProducts(access, page.data), { headers: privateHeaders });
  } catch (error) { return productErrorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new ProductRequestError(403, "Request origin is not allowed.");
    const { tenantId } = await params;
    const access = await requireTenantAccess(tenantId, "ADMIN");
    const input = await readProductInput(request);
    const product = await createProduct(access, input);
    return Response.json({ product }, { status: 201, headers: privateHeaders });
  } catch (error) { return productErrorResponse(error); }
}

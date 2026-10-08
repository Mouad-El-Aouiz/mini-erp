import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { getProduct, replaceProduct } from "@/lib/product-data";
import { productErrorResponse, ProductRequestError, privateHeaders, readProductInput } from "@/lib/product-http";
import { entityIdSchema as productIdSchema } from "@/lib/validation/common";

type Context = { params: Promise<{ tenantId: string; productId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId, productId } = await params;
    const access = await requireTenantAccess(tenantId);
    if (!productIdSchema.safeParse(productId).success) throw new ProductRequestError(400, "Invalid product identifier.");
    return Response.json({ product: await getProduct(access, productId) }, { headers: privateHeaders });
  } catch (error) { return productErrorResponse(error); }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new ProductRequestError(403, "Request origin is not allowed.");
    const { tenantId, productId } = await params;
    const access = await requireTenantAccess(tenantId, "ADMIN");
    if (!productIdSchema.safeParse(productId).success) throw new ProductRequestError(400, "Invalid product identifier.");
    const input = await readProductInput(request);
    return Response.json({ product: await replaceProduct(access, productId, input) }, { headers: privateHeaders });
  } catch (error) { return productErrorResponse(error); }
}

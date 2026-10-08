import { requireTenantAccess } from "@/lib/tenant-access";
import { isTrustedOrigin } from "@/lib/request-origin";
import { adjustInventory, getInventoryHistory } from "@/lib/inventory-data";
import { inventoryErrorResponse, InventoryRequestError, privateHeaders, readAdjustmentInput } from "@/lib/inventory-http";
import { entityIdSchema, pageNumberSchema } from "@/lib/validation/common";
type Context = { params: Promise<{ tenantId: string; productId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const { tenantId, productId } = await params;
    const access = await requireTenantAccess(tenantId);
    if (!entityIdSchema.safeParse(productId).success) throw new InventoryRequestError(400, "Invalid product identifier.");
    const values = new URL(request.url).searchParams.getAll("page");
    const page = pageNumberSchema.safeParse(values.length === 0 ? undefined : values.length === 1 ? values[0] : values);
    if (!page.success) throw new InventoryRequestError(400, "Invalid page number.");
    return Response.json(await getInventoryHistory(access, productId, page.data), { headers: privateHeaders });
  } catch (error) { return inventoryErrorResponse(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    if (!isTrustedOrigin(request)) throw new InventoryRequestError(403, "Request origin is not allowed.");
    const { tenantId, productId } = await params;
    const access = await requireTenantAccess(tenantId, "ADMIN");
    if (!entityIdSchema.safeParse(productId).success) throw new InventoryRequestError(400, "Invalid product identifier.");
    const result = await adjustInventory(access, productId, await readAdjustmentInput(request));
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: privateHeaders });
  } catch (error) { return inventoryErrorResponse(error); }
}

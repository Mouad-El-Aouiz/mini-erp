import { requireTenantAccess } from "@/lib/tenant-access";
import { listInventory } from "@/lib/inventory-data";
import { inventoryErrorResponse, InventoryRequestError, privateHeaders } from "@/lib/inventory-http";
import { pageNumberSchema } from "@/lib/validation/common";
export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const access = await requireTenantAccess((await params).tenantId);
    const values = new URL(request.url).searchParams.getAll("page");
    const page = pageNumberSchema.safeParse(values.length === 0 ? undefined : values.length === 1 ? values[0] : values);
    if (!page.success) throw new InventoryRequestError(400, "Invalid page number.");
    return Response.json(await listInventory(access, page.data), { headers: privateHeaders });
  } catch (error) { return inventoryErrorResponse(error); }
}

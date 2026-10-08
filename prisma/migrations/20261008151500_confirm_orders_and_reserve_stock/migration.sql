BEGIN;

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';

-- AlterTable
ALTER TABLE "inventory_balances" ADD COLUMN     "reserved_quantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "accepted_tax_rate_bps" INTEGER,
ADD COLUMN     "confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "confirmed_by_membership_id" UUID,
ADD COLUMN     "confirmed_tax_version" INTEGER,
ADD COLUMN     "customer_company_name" TEXT,
ADD COLUMN     "subtotal_cents" INTEGER,
ADD COLUMN     "tax_cents" INTEGER,
ADD COLUMN     "total_cents" BIGINT;

-- CreateTable
CREATE TABLE "stock_reservations" (
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("tenant_id","order_id","product_id")
);

-- CreateIndex
CREATE INDEX "stock_reservations_tenant_id_product_id_idx" ON "stock_reservations"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_confirmed_by_membership_id_idx" ON "orders"("tenant_id", "confirmed_by_membership_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_confirmed_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "confirmed_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_order_id_product_id_fkey" FOREIGN KEY ("tenant_id", "order_id", "product_id") REFERENCES "order_items"("tenant_id", "order_id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cast status to text so the newly added enum label is not used before commit.
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_reserved_valid
  CHECK (reserved_quantity BETWEEN 0 AND physical_quantity);
ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_quantity_valid
  CHECK (quantity BETWEEN 1 AND 1000000);
ALTER TABLE orders ADD CONSTRAINT orders_confirmation_snapshot_valid CHECK (
  (status::text='DRAFT' AND confirmed_at IS NULL AND confirmed_by_membership_id IS NULL
    AND confirmed_tax_version IS NULL AND accepted_tax_rate_bps IS NULL
    AND subtotal_cents IS NULL AND tax_cents IS NULL AND total_cents IS NULL AND customer_company_name IS NULL)
  OR
  (status::text='CONFIRMED' AND confirmed_at IS NOT NULL AND confirmed_by_membership_id IS NOT NULL
    AND confirmed_tax_version IS NOT NULL AND confirmed_tax_version>0
    AND accepted_tax_rate_bps IS NOT NULL AND accepted_tax_rate_bps BETWEEN 0 AND 10000
    AND subtotal_cents IS NOT NULL AND subtotal_cents>=0
    AND tax_cents IS NOT NULL AND tax_cents>=0
    AND total_cents IS NOT NULL AND total_cents=subtotal_cents::bigint+tax_cents::bigint
    AND tax_cents=(subtotal_cents::bigint*accepted_tax_rate_bps+5000)/10000
    AND customer_company_name IS NOT NULL AND customer_company_name ~ '[^[:space:]]')
);
COMMIT;

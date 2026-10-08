BEGIN;

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('ADJUSTMENT', 'DELIVERY');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "kind" "StockMovementKind" NOT NULL DEFAULT 'ADJUSTMENT',
ADD COLUMN     "order_id" UUID;

-- AlterTable
ALTER TABLE "stock_reservations" ADD COLUMN     "consumed_at" TIMESTAMPTZ(3),
ADD COLUMN     "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "delivered_by_membership_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliveries_tenant_id_delivered_by_membership_id_idx" ON "deliveries"("tenant_id", "delivered_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_tenant_id_order_id_key" ON "deliveries"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_tenant_id_order_id_product_id_key" ON "stock_movements"("tenant_id", "order_id", "product_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "deliveries"("tenant_id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_order_id_product_id_fkey" FOREIGN KEY ("tenant_id", "order_id", "product_id") REFERENCES "order_items"("tenant_id", "order_id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_delivered_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "delivered_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_consumption_valid CHECK (
  (status='ACTIVE' AND consumed_at IS NULL) OR (status='CONSUMED' AND consumed_at IS NOT NULL)
);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_valid CHECK (
  (kind='ADJUSTMENT' AND order_id IS NULL)
  OR (kind='DELIVERY' AND order_id IS NOT NULL AND quantity_delta BETWEEN -1000000 AND -1)
);
-- Financial snapshots remain required for both accepted states. Use text for the new enum label.
ALTER TABLE orders DROP CONSTRAINT orders_confirmation_snapshot_valid;
ALTER TABLE orders ADD CONSTRAINT orders_confirmation_snapshot_valid CHECK (
  (status::text='DRAFT' AND confirmed_at IS NULL AND confirmed_by_membership_id IS NULL
    AND confirmed_tax_version IS NULL AND accepted_tax_rate_bps IS NULL
    AND subtotal_cents IS NULL AND tax_cents IS NULL AND total_cents IS NULL AND customer_company_name IS NULL)
  OR
  (status::text IN ('CONFIRMED','DELIVERED') AND confirmed_at IS NOT NULL AND confirmed_by_membership_id IS NOT NULL
    AND confirmed_tax_version IS NOT NULL AND confirmed_tax_version>0
    AND accepted_tax_rate_bps IS NOT NULL AND accepted_tax_rate_bps BETWEEN 0 AND 10000
    AND subtotal_cents IS NOT NULL AND subtotal_cents>=0
    AND tax_cents IS NOT NULL AND tax_cents>=0
    AND total_cents IS NOT NULL AND total_cents=subtotal_cents::bigint+tax_cents::bigint
    AND tax_cents=(subtotal_cents::bigint*accepted_tax_rate_bps+5000)/10000
    AND customer_company_name IS NOT NULL AND customer_company_name ~ '[^[:space:]]')
);

COMMIT;

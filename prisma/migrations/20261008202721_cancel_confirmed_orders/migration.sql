BEGIN;

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE 'RELEASED';

-- AlterTable
ALTER TABLE "stock_reservations" ADD COLUMN     "released_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "cancellations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "cancelled_by_membership_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,

    CONSTRAINT "cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cancellations_tenant_id_cancelled_by_membership_id_idx" ON "cancellations"("tenant_id", "cancelled_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "cancellations_tenant_id_order_id_key" ON "cancellations"("tenant_id", "order_id");

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_tenant_id_cancelled_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "cancelled_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE cancellations ADD CONSTRAINT cancellations_reason_valid CHECK (
  char_length(reason) BETWEEN 1 AND 500 AND reason ~ '[^[:space:]]'
);
ALTER TABLE stock_reservations DROP CONSTRAINT stock_reservations_consumption_valid;
-- Compare new enum labels as text until ALTER TYPE commits.
ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_consumption_valid CHECK (
  (status::text='ACTIVE' AND consumed_at IS NULL AND released_at IS NULL)
  OR (status::text='CONSUMED' AND consumed_at IS NOT NULL AND released_at IS NULL)
  OR (status::text='RELEASED' AND consumed_at IS NULL AND released_at IS NOT NULL)
);

ALTER TABLE orders DROP CONSTRAINT orders_confirmation_snapshot_valid;
ALTER TABLE orders ADD CONSTRAINT orders_confirmation_snapshot_valid CHECK (
  (status::text='DRAFT' AND confirmed_at IS NULL AND confirmed_by_membership_id IS NULL
    AND confirmed_tax_version IS NULL AND accepted_tax_rate_bps IS NULL
    AND subtotal_cents IS NULL AND tax_cents IS NULL AND total_cents IS NULL AND customer_company_name IS NULL)
  OR
  (status::text IN ('CONFIRMED','DELIVERED','CANCELLED') AND confirmed_at IS NOT NULL AND confirmed_by_membership_id IS NOT NULL
    AND confirmed_tax_version IS NOT NULL AND confirmed_tax_version>0
    AND accepted_tax_rate_bps IS NOT NULL AND accepted_tax_rate_bps BETWEEN 0 AND 10000
    AND subtotal_cents IS NOT NULL AND subtotal_cents>=0
    AND tax_cents IS NOT NULL AND tax_cents>=0
    AND total_cents IS NOT NULL AND total_cents=subtotal_cents::bigint+tax_cents::bigint
    AND tax_cents=(subtotal_cents::bigint*accepted_tax_rate_bps+5000)/10000
    AND customer_company_name IS NOT NULL AND customer_company_name ~ '[^[:space:]]')
);


COMMIT;

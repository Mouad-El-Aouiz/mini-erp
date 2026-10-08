BEGIN;

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "tax_rate_bps" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "tax_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_sku" TEXT NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_tenant_id_updated_at_id_idx" ON "orders"("tenant_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_customer_id_idx" ON "orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_created_by_membership_id_idx" ON "orders"("tenant_id", "created_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_id_key" ON "orders"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_request_id_key" ON "orders"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_product_id_idx" ON "order_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_tenant_id_order_id_product_id_key" ON "order_items"("tenant_id", "order_id", "product_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application rules also protect direct SQL writes.
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_tax_rate_valid" CHECK ("tax_rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "tenants_tax_version_positive" CHECK ("tax_version" > 0);
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_version_positive" CHECK ("version" > 0),
  ADD CONSTRAINT "orders_request_hash_valid" CHECK ("request_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_valid" CHECK ("quantity" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "order_items_price_non_negative" CHECK ("unit_price_cents" >= 0),
  ADD CONSTRAINT "order_items_name_not_blank" CHECK ("product_name" ~ '[^[:space:]]'),
  ADD CONSTRAINT "order_items_sku_valid" CHECK ("product_sku" ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$');
COMMIT;

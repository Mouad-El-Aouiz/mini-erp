-- CreateTable
CREATE TABLE "inventory_balances" (
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "physical_quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("tenant_id","product_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "recorded_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_product_id_created_at_id_idx" ON "stock_movements"("tenant_id", "product_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_recorded_by_membership_id_idx" ON "stock_movements"("tenant_id", "recorded_by_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_tenant_id_request_id_key" ON "stock_movements"("tenant_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_id_key" ON "memberships"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_recorded_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "recorded_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints are maintained in SQL because Prisma cannot express them.
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_physical_non_negative" CHECK ("physical_quantity" >= 0);
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_delta_non_zero" CHECK ("quantity_delta" <> 0),
  ADD CONSTRAINT "stock_movements_reason_valid" CHECK ("reason" ~ '[^[:space:]]' AND char_length("reason") <= 500);

-- Existing products start at zero; starting quantities must be recorded as movements.
INSERT INTO "inventory_balances" ("tenant_id", "product_id", "physical_quantity", "updated_at")
SELECT "tenant_id", "id", 0, CURRENT_TIMESTAMP FROM "products";

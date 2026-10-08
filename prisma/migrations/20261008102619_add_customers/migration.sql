-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_tenant_id_company_name_id_idx" ON "customers"("tenant_id", "company_name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_id_key" ON "customers"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reject empty or whitespace-only company names.
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_name_not_blank" CHECK ("company_name" ~ '[^[:space:]]');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "demo_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "demo_owner_id" TEXT;

-- CreateTable
CREATE TABLE "demo_signup_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_signup_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demo_signup_attempts_created_at_idx" ON "demo_signup_attempts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_demo_owner_id_key" ON "tenants"("demo_owner_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_demo_owner_id_fkey" FOREIGN KEY ("demo_owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE tenants ADD CONSTRAINT tenants_demo_metadata_pair CHECK ((demo_owner_id IS NULL) = (demo_expires_at IS NULL));

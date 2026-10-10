-- Optimistic concurrency for company membership administration.
ALTER TABLE "memberships" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_version_positive" CHECK ("version" > 0);

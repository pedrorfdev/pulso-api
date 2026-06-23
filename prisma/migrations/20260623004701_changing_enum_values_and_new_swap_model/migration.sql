/*
  Warnings:

  - The values [PENDING_TARGET,REJECTED_TARGET] on the enum `SwapStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SwapStatus_new" AS ENUM ('PENDING_OPEN', 'PENDING_LEADER', 'APPROVED', 'REJECTED_VOLUNTEER', 'REJECTED_LEADER', 'CANCELLED');
ALTER TABLE "public"."swap_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "swap_requests" ALTER COLUMN "status" TYPE "SwapStatus_new" USING ("status"::text::"SwapStatus_new");
ALTER TYPE "SwapStatus" RENAME TO "SwapStatus_old";
ALTER TYPE "SwapStatus_new" RENAME TO "SwapStatus";
DROP TYPE "public"."SwapStatus_old";
ALTER TABLE "swap_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING_OPEN';
COMMIT;

-- DropForeignKey
ALTER TABLE "swap_requests" DROP CONSTRAINT "swap_requests_target_slot_id_fkey";

-- AlterTable
ALTER TABLE "swap_requests" ALTER COLUMN "target_slot_id" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING_OPEN';

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_target_slot_id_fkey" FOREIGN KEY ("target_slot_id") REFERENCES "schedule_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

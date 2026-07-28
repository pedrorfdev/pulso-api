/*
  Warnings:

  - You are about to drop the `tech_check_assignments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tech_check_items` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tech_check_assignments" DROP CONSTRAINT "tech_check_assignments_item_id_fkey";

-- DropForeignKey
ALTER TABLE "tech_check_assignments" DROP CONSTRAINT "tech_check_assignments_member_id_fkey";

-- DropForeignKey
ALTER TABLE "tech_check_items" DROP CONSTRAINT "tech_check_items_created_by_fkey";

-- DropForeignKey
ALTER TABLE "tech_check_items" DROP CONSTRAINT "tech_check_items_event_id_fkey";

-- DropTable
DROP TABLE "tech_check_assignments";

-- DropTable
DROP TABLE "tech_check_items";

-- DropEnum
DROP TYPE "CheckItemStatus";

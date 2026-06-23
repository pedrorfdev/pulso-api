/*
  Warnings:

  - You are about to drop the column `role_label` on the `schedule_slots` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "schedule_slots" DROP COLUMN "role_label",
ADD COLUMN     "role_labels" TEXT[];

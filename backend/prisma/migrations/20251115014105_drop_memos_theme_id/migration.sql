/*
  Warnings:

  - You are about to drop the column `theme_id` on the `memos` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "memos" DROP CONSTRAINT "memos_theme_id_fkey";

-- DropIndex
DROP INDEX "notebook_tags_notebook_id_idx";

-- DropIndex
DROP INDEX "notebook_tags_tag_id_idx";

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "memos" DROP COLUMN "theme_id";

-- RenameIndex
ALTER INDEX "notebooks_userId_name_idx" RENAME TO "notebooks_user_id_name_idx";

-- RenameIndex
ALTER INDEX "notebooks_userId_updatedAt_idx" RENAME TO "notebooks_user_id_updatedAt_idx";

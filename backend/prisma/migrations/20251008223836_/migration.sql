/*
  Warnings:

  - You are about to drop the column `supabase_id` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[oauth_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_supabase_id_key";

-- AlterTable
ALTER TABLE "memos" ADD COLUMN     "notebook_id" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "supabase_id",
ADD COLUMN     "oauth_id" TEXT;

-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "notebook_name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme_id" TEXT,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_oauth_id_key" ON "users"("oauth_id");

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

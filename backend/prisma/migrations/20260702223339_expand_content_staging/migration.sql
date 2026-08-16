-- AlterTable
ALTER TABLE "memos" ADD COLUMN     "content_html" TEXT,
ADD COLUMN     "content_json" JSONB,
ADD COLUMN     "content_text" TEXT;

-- AlterTable
ALTER TABLE "notebooks" ADD COLUMN     "content_html" TEXT,
ADD COLUMN     "content_json" JSONB,
ADD COLUMN     "content_text" TEXT;

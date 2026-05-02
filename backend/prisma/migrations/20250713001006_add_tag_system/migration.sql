-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memo_tags" (
    "memo_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "memo_tags_pkey" PRIMARY KEY ("memo_id","tag_id")
);

-- CreateTable
CREATE TABLE "notebook_tags" (
    "notebook_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "notebook_tags_pkey" PRIMARY KEY ("notebook_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_tags" ADD CONSTRAINT "memo_tags_memo_id_fkey" FOREIGN KEY ("memo_id") REFERENCES "memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_tags" ADD CONSTRAINT "memo_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_tags" ADD CONSTRAINT "notebook_tags_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_tags" ADD CONSTRAINT "notebook_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

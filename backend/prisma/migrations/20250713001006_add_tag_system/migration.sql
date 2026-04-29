-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memo_tags" (
    "id" TEXT NOT NULL,
    "memo_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "memo_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "memo_tags_memo_id_tag_id_key" ON "memo_tags"("memo_id", "tag_id");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_tags" ADD CONSTRAINT "memo_tags_memo_id_fkey" FOREIGN KEY ("memo_id") REFERENCES "memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo_tags" ADD CONSTRAINT "memo_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

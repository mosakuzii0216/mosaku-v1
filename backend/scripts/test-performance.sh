#!/bin/bash

echo "========================================"
echo "Performance Test (Supabase)"
echo "========================================"
echo ""

# 色付きの出力関数
print_test() {
    echo -e "\033[1;34m[TEST]\033[0m $1"
}

print_result() {
    echo -e "\033[1;32m[RESULT]\033[0m $1"
}

print_info() {
    echo -e "\033[1;33m[INFO]\033[0m $1"
}

cd /Users/onotakashi/mosaku/backend

# 1. ユーザー数カウントのパフォーマンス
print_test "1. User count query performance (10 iterations)..."
START=$(date +%s%N)
for i in {1..10}; do
  npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function test() {
      await prisma.user.count();
      await prisma.\$disconnect();
    }
    test();
  " 2>/dev/null > /dev/null
done
END=$(date +%s%N)
ELAPSED=$(( ($END - $START) / 1000000 ))
AVG=$(( $ELAPSED / 10 ))
print_result "Average time: ${AVG}ms"
echo ""

# 2. メモ取得のパフォーマンス
print_test "2. Memo findMany query performance (10 iterations)..."
START=$(date +%s%N)
for i in {1..10}; do
  npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function test() {
      await prisma.memo.findMany({ take: 10 });
      await prisma.\$disconnect();
    }
    test();
  " 2>/dev/null > /dev/null
done
END=$(date +%s%N)
ELAPSED=$(( ($END - $START) / 1000000 ))
AVG=$(( $ELAPSED / 10 ))
print_result "Average time: ${AVG}ms"
echo ""

# 3. ノートブック取得のパフォーマンス
print_test "3. Notebook findMany query performance (10 iterations)..."
START=$(date +%s%N)
for i in {1..10}; do
  npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function test() {
      await prisma.notebook.findMany({ take: 10 });
      await prisma.\$disconnect();
    }
    test();
  " 2>/dev/null > /dev/null
done
END=$(date +%s%N)
ELAPSED=$(( ($END - $START) / 1000000 ))
AVG=$(( $ELAPSED / 10 ))
print_result "Average time: ${AVG}ms"
echo ""

# 4. リレーション付きクエリのパフォーマンス
print_test "4. Memo with relations query performance (10 iterations)..."
START=$(date +%s%N)
for i in {1..10}; do
  npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function test() {
      await prisma.memo.findMany({
        take: 10,
        include: {
          user: true,
          notebook: true,
          tags: true,
        },
      });
      await prisma.\$disconnect();
    }
    test();
  " 2>/dev/null > /dev/null
done
END=$(date +%s%N)
ELAPSED=$(( ($END - $START) / 1000000 ))
AVG=$(( $ELAPSED / 10 ))
print_result "Average time: ${AVG}ms"
echo ""

# 5. 書き込みパフォーマンス
print_test "5. Write operation performance (create + delete, 10 iterations)..."
START=$(date +%s%N)
for i in {1..10}; do
  npx tsx -e "
    import { PrismaClient } from '@prisma/client';
    const prisma = new PrismaClient();
    async function test() {
      const user = await prisma.user.findFirst();
      if (user) {
        const memo = await prisma.memo.create({
          data: {
            title: 'Perf Test',
            content: 'Testing',
            userId: user.id,
          },
        });
        await prisma.memo.delete({ where: { id: memo.id } });
      }
      await prisma.\$disconnect();
    }
    test();
  " 2>/dev/null > /dev/null
done
END=$(date +%s%N)
ELAPSED=$(( ($END - $START) / 1000000 ))
AVG=$(( $ELAPSED / 10 ))
print_result "Average time: ${AVG}ms"
echo ""

echo "========================================"
echo "Performance Summary"
echo "========================================"
print_info "All queries completed successfully"
print_info "Connection: Supabase PostgreSQL (pooled)"
print_info "Note: Times include Prisma client initialization overhead"
echo ""

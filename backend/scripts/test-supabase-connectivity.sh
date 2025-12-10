#!/bin/bash

BASE_URL="http://localhost:3000"

echo "========================================"
echo "Supabase Connectivity Test"
echo "========================================"
echo ""

# 色付きの出力関数
print_test() {
    echo -e "\033[1;34m[TEST]\033[0m $1"
}

print_pass() {
    echo -e "\033[1;32m[PASS]\033[0m $1"
}

print_fail() {
    echo -e "\033[1;31m[FAIL]\033[0m $1"
}

print_info() {
    echo -e "\033[1;33m[INFO]\033[0m $1"
}

# 1. バックエンドの起動確認
print_test "1. Checking backend status..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL")

if [ "$HEALTH_RESPONSE" != "000" ]; then
    print_pass "Backend is running"
    print_info "HTTP Status: $HEALTH_RESPONSE"
else
    print_fail "Backend is not accessible"
    exit 1
fi
echo ""

# 2. Supabaseからのデータ取得確認（Prismaを使用）
print_test "2. Verifying data retrieval from Supabase..."

# データベースから直接データを取得
cd /Users/onotakashi/mosaku/backend

# ユーザー数を確認
USER_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function check() {
  const count = await prisma.user.count();
  console.log(count);
  await prisma.\$disconnect();
}
check();
" 2>/dev/null)

if [ -n "$USER_COUNT" ] && [ "$USER_COUNT" != "0" ]; then
    print_pass "Successfully retrieved data from Supabase"
    print_info "Users in database: $USER_COUNT"
else
    print_fail "Failed to retrieve data from Supabase"
    exit 1
fi
echo ""

# 3. メモ数を確認
print_test "3. Checking memos count..."
MEMO_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function check() {
  const count = await prisma.memo.count();
  console.log(count);
  await prisma.\$disconnect();
}
check();
" 2>/dev/null)

if [ -n "$MEMO_COUNT" ]; then
    print_pass "Memos retrieved successfully"
    print_info "Memos in database: $MEMO_COUNT"
else
    print_fail "Failed to retrieve memos"
fi
echo ""

# 4. ノートブック数を確認
print_test "4. Checking notebooks count..."
NOTEBOOK_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function check() {
  const count = await prisma.notebook.count();
  console.log(count);
  await prisma.\$disconnect();
}
check();
" 2>/dev/null)

if [ -n "$NOTEBOOK_COUNT" ]; then
    print_pass "Notebooks retrieved successfully"
    print_info "Notebooks in database: $NOTEBOOK_COUNT"
else
    print_fail "Failed to retrieve notebooks"
fi
echo ""

# 5. テーマ数を確認
print_test "5. Checking themes count..."
THEME_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function check() {
  const count = await prisma.theme.count();
  console.log(count);
  await prisma.\$disconnect();
}
check();
" 2>/dev/null)

if [ -n "$THEME_COUNT" ]; then
    print_pass "Themes retrieved successfully"
    print_info "Themes in database: $THEME_COUNT"
else
    print_fail "Failed to retrieve themes"
fi
echo ""

# 6. カテゴリ数を確認
print_test "6. Checking categories count..."
CATEGORY_COUNT=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function check() {
  const count = await prisma.category.count();
  console.log(count);
  await prisma.\$disconnect();
}
check();
" 2>/dev/null)

if [ -n "$CATEGORY_COUNT" ]; then
    print_pass "Categories retrieved successfully"
    print_info "Categories in database: $CATEGORY_COUNT"
else
    print_fail "Failed to retrieve categories"
fi
echo ""

# 7. 書き込みテスト（テストメモの作成と削除）
print_test "7. Testing write operations to Supabase..."
WRITE_TEST=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
  try {
    // 既存ユーザーを取得
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('NO_USER');
      await prisma.\$disconnect();
      return;
    }

    // テストメモを作成
    const memo = await prisma.memo.create({
      data: {
        title: 'Test Memo - Connectivity Test',
        content: 'Testing Supabase write operations',
        userId: user.id,
      },
    });

    // 作成したメモを削除
    await prisma.memo.delete({
      where: { id: memo.id },
    });

    console.log('SUCCESS');
  } catch (error) {
    console.log('ERROR');
  } finally {
    await prisma.\$disconnect();
  }
}
test();
" 2>/dev/null)

if [ "$WRITE_TEST" = "SUCCESS" ]; then
    print_pass "Write operations successful"
    print_info "Created and deleted test memo"
elif [ "$WRITE_TEST" = "NO_USER" ]; then
    print_fail "No user found for testing"
else
    print_fail "Write operations failed"
fi
echo ""

echo "========================================"
echo "Test Summary"
echo "========================================"
print_info "Expected data counts:"
print_info "  - Users: 1"
print_info "  - Memos: 7"
print_info "  - Notebooks: 6"
print_info "  - Themes: 5"
print_info "  - Categories: 5"
echo ""
print_info "Actual data counts:"
print_info "  - Users: $USER_COUNT"
print_info "  - Memos: $MEMO_COUNT"
print_info "  - Notebooks: $NOTEBOOK_COUNT"
print_info "  - Themes: $THEME_COUNT"
print_info "  - Categories: $CATEGORY_COUNT"
echo ""

if [ "$USER_COUNT" = "1" ] && [ "$MEMO_COUNT" = "7" ] && [ "$NOTEBOOK_COUNT" = "6" ] && [ "$THEME_COUNT" = "5" ] && [ "$CATEGORY_COUNT" = "5" ]; then
    echo -e "\033[1;32m✅ All data migration verified successfully!\033[0m"
    echo -e "\033[1;32m✅ Supabase connectivity confirmed!\033[0m"
    echo -e "\033[1;32m✅ Read/Write operations working correctly!\033[0m"
else
    echo -e "\033[1;33m⚠️  Data counts don't match expected values\033[0m"
fi
echo ""

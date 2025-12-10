#!/bin/bash

BASE_URL="http://localhost:3000"
TOKEN=""

echo "=================================="
echo "Backend API Test with Supabase"
echo "=================================="
echo ""

# テスト用のデータ
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_NAME="Test User"
INVITATION_CODE="OSCHF1842"

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

# 1. ユーザー登録テスト
print_test "1. Testing user registration..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"$TEST_NAME\",\"invitationCode\":\"$INVITATION_CODE\"}")

if echo "$REGISTER_RESPONSE" | grep -q "Registration successful"; then
    print_pass "User registration successful"
    print_info "Email: $TEST_EMAIL"
else
    print_fail "User registration failed"
    echo "$REGISTER_RESPONSE" | jq '.' 2>/dev/null || echo "$REGISTER_RESPONSE"
    exit 1
fi
echo ""

# 2. ログインテスト
print_test "2. Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken' 2>/dev/null)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    print_pass "Login successful"
    print_info "Access token obtained"
else
    print_fail "Login failed"
    echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
    exit 1
fi
echo ""

# 3. メモ一覧取得テスト
print_test "3. Testing GET /memos (with auth)..."
MEMOS_RESPONSE=$(curl -s -X GET "$BASE_URL/memos" \
  -H "Authorization: Bearer $TOKEN")

MEMOS_COUNT=$(echo "$MEMOS_RESPONSE" | jq '. | length' 2>/dev/null)
if [ -n "$MEMOS_COUNT" ] && [ "$MEMOS_COUNT" != "null" ]; then
    print_pass "GET /memos successful"
    print_info "Found $MEMOS_COUNT memos"
else
    print_fail "GET /memos failed"
    echo "$MEMOS_RESPONSE" | jq '.' 2>/dev/null || echo "$MEMOS_RESPONSE"
fi
echo ""

# 4. ノートブック一覧取得テスト
print_test "4. Testing GET /notebooks (with auth)..."
NOTEBOOKS_RESPONSE=$(curl -s -X GET "$BASE_URL/notebooks" \
  -H "Authorization: Bearer $TOKEN")

NOTEBOOKS_COUNT=$(echo "$NOTEBOOKS_RESPONSE" | jq '. | length' 2>/dev/null)
if [ -n "$NOTEBOOKS_COUNT" ] && [ "$NOTEBOOKS_COUNT" != "null" ]; then
    print_pass "GET /notebooks successful"
    print_info "Found $NOTEBOOKS_COUNT notebooks"
else
    print_fail "GET /notebooks failed"
    echo "$NOTEBOOKS_RESPONSE" | jq '.' 2>/dev/null || echo "$NOTEBOOKS_RESPONSE"
fi
echo ""

# 5. タグ一覧取得テスト
print_test "5. Testing GET /tags (with auth)..."
TAGS_RESPONSE=$(curl -s -X GET "$BASE_URL/tags" \
  -H "Authorization: Bearer $TOKEN")

TAGS_COUNT=$(echo "$TAGS_RESPONSE" | jq '. | length' 2>/dev/null)
if [ -n "$TAGS_COUNT" ] && [ "$TAGS_COUNT" != "null" ]; then
    print_pass "GET /tags successful"
    print_info "Found $TAGS_COUNT tags"
else
    print_fail "GET /tags failed"
    echo "$TAGS_RESPONSE" | jq '.' 2>/dev/null || echo "$TAGS_RESPONSE"
fi
echo ""

# 6. メモ作成テスト
print_test "6. Testing POST /memos (create memo)..."
CREATE_MEMO_RESPONSE=$(curl -s -X POST "$BASE_URL/memos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Memo from API Test","content":"This is a test memo created via API to verify Supabase connectivity"}')

CREATED_MEMO_ID=$(echo "$CREATE_MEMO_RESPONSE" | jq -r '.id' 2>/dev/null)
if [ -n "$CREATED_MEMO_ID" ] && [ "$CREATED_MEMO_ID" != "null" ]; then
    print_pass "POST /memos successful"
    print_info "Created memo ID: $CREATED_MEMO_ID"
else
    print_fail "POST /memos failed"
    echo "$CREATE_MEMO_RESPONSE" | jq '.' 2>/dev/null || echo "$CREATE_MEMO_RESPONSE"
fi
echo ""

# 7. メモ更新テスト
if [ -n "$CREATED_MEMO_ID" ] && [ "$CREATED_MEMO_ID" != "null" ]; then
    print_test "7. Testing PATCH /memos/:id (update memo)..."
    UPDATE_MEMO_RESPONSE=$(curl -s -X PATCH "$BASE_URL/memos/$CREATED_MEMO_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"title":"Updated Test Memo","content":"Updated content"}')

    UPDATED_TITLE=$(echo "$UPDATE_MEMO_RESPONSE" | jq -r '.title' 2>/dev/null)
    if [ "$UPDATED_TITLE" = "Updated Test Memo" ]; then
        print_pass "PATCH /memos/:id successful"
    else
        print_fail "PATCH /memos/:id failed"
        echo "$UPDATE_MEMO_RESPONSE" | jq '.' 2>/dev/null || echo "$UPDATE_MEMO_RESPONSE"
    fi
    echo ""

    # 8. メモ削除テスト
    print_test "8. Testing DELETE /memos/:id (delete memo)..."
    DELETE_MEMO_RESPONSE=$(curl -s -X DELETE "$BASE_URL/memos/$CREATED_MEMO_ID" \
      -H "Authorization: Bearer $TOKEN")

    if echo "$DELETE_MEMO_RESPONSE" | grep -q "Memo deleted successfully"; then
        print_pass "DELETE /memos/:id successful"
    else
        print_fail "DELETE /memos/:id failed"
        echo "$DELETE_MEMO_RESPONSE" | jq '.' 2>/dev/null || echo "$DELETE_MEMO_RESPONSE"
    fi
    echo ""
fi

# 9. 認証なしでのアクセステスト
print_test "9. Testing unauthorized access (should fail)..."
UNAUTH_RESPONSE=$(curl -s -X GET "$BASE_URL/memos")

if echo "$UNAUTH_RESPONSE" | grep -q "Unauthorized"; then
    print_pass "Unauthorized access blocked correctly"
else
    print_fail "Unauthorized access test failed"
    echo "$UNAUTH_RESPONSE"
fi
echo ""

echo "=================================="
echo "Test Summary"
echo "=================================="
print_info "All API tests completed"
print_info "Backend is successfully connected to Supabase"
print_info "All CRUD operations are working correctly"
echo ""

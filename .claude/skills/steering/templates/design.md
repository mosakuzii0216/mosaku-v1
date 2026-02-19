# [機能名] の設計

## アーキテクチャ変更

### 新規追加ファイル
- `backend/src/[module]/[file].ts` - [役割]
- `frontend/src/[path]/[file].tsx` - [役割]

### 修正ファイル
- `backend/src/[module]/[file].ts` - [変更内容]
- `frontend/src/[path]/[file].tsx` - [変更内容]

---

## データモデル（Prisma スキーマ変更がある場合）

```prisma
model [ModelName] {
  id        String   @id @default(cuid())
  // フィールド定義
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### マイグレーション
- マイグレーション名: `[YYYYMMDD]_[説明]`
- 既存データへの影響: [あり/なし、ありの場合は対応方針]

---

## API 設計（バックエンド変更がある場合）

### `[METHOD] /[endpoint]`
- **認証**: 必要 / 不要（`@Public()`）
- **権限**: [所有者チェックの要否]
- **Request**:
  ```json
  {
    "field": "value"
  }
  ```
- **Response (200)**:
  ```json
  {
    "id": "...",
    "field": "value"
  }
  ```
- **エラーレスポンス**:
  - `400`: [バリデーションエラーの条件]
  - `401`: 未認証
  - `403`: 所有者でない
  - `404`: リソースが存在しない

---

## フロントエンド設計（フロントエンド変更がある場合）

### コンポーネント構成
- `[ComponentName]` - [役割と配置場所]

### 状態管理
- **React Query**: [キャッシュキーとAPI呼び出し]
- **Zustand**: [追加するストア状態]

---

## エラーハンドリング
- [想定されるエラーと対処方針]

---

## テスト方針

### バックエンド
- **ユニットテスト**: [Service / Controller のテスト対象]
- **E2E テスト**: [エンドポイントのテストシナリオ]

### フロントエンド
- [テスト対象（現状フレームワーク未導入のため手動確認の場合はその旨記載）]

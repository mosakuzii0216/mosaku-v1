# コード監査レポート

作成日: 2026-03-17
目的: バイブコーディングで積み上げた技術的負債の洗い出し

---

## 🔴 高優先度（重大・必須対処）

### A-1: X/Twitter OAuth 残留コード

**影響**: フロントエンドから未実装エンドポイントを呼び出すと 500 エラー

| ファイル                                       | 内容                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `frontend/src/utils/auth.ts` L250-270          | `xRegisterWithInvitation()` - 存在しないエンドポイントを呼び出す |
| `frontend/src/utils/oauthAuth.ts` L44-62       | `XAuthUtilsClass` - `/auth/x` へリダイレクト（404）              |
| `frontend/src/constants/features.ts` L30-38    | `OAUTH_X` フィーチャーフラグ                                     |
| `backend/src/config/features.config.ts` L35-42 | `OAUTH_X` フィーチャーフラグ                                     |

**対処**: 上記ファイルから X/Twitter 関連コードを全削除

---

### A-2: PREMIUM/FREE ロール参照

**影響**: ロールモデルが ADMIN/USER に整理されたが、旧ロールへの参照が残る

| ファイル                                       | 内容                                       |
| ---------------------------------------------- | ------------------------------------------ |
| `backend/src/auth/auth.service.ts` L80         | `role: isAdmin ? 'ADMIN' : 'FREE'`         |
| `backend/src/auth/oauth.service.ts` L62, L111  | `role: 'FREE'` でユーザー作成              |
| `backend/src/config/features.config.ts` L44-52 | `PREMIUM_FEATURES` フラグ（未使用）        |
| `frontend/src/utils/auth.ts` L9, L40           | `UserProfile.role` の型定義に PREMIUM/FREE |

**対処**: `FREE` → `USER` に変更、`PREMIUM` と `PREMIUM_FEATURES` は削除

---

### A-3: InvitationManager で直接 fetch（apiClient 未使用）

**影響**: 本番環境（Vercel）で URL がハードコード `http://localhost` になり動作しない

| ファイル                                                       | 内容                                            |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `frontend/src/components/admin/InvitationManager.tsx` L37, L71 | `fetch('http://localhost/api/invitation', ...)` |

**対処**: `apiClient` 経由に書き換える

---

### A-4: Zustand と React Query の責務混在

**影響**: `useMemoDataStore` がサーバーデータを持つため、React Query の invalidation 後も Zustand が古いデータを返す可能性がある

| ファイル                                  | 内容                                 |
| ----------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `frontend/src/stores/useMemoDataStore.ts` | `memos: Memo[]`・`selectedMemo: Memo | null` をZustandで保持、`addMemo/updateMemo/deleteMemo` でローカル更新 |

**対処**: サーバーデータは React Query のみで管理。`useMemoDataStore` からサーバーデータを除去し、UI状態（選択中IDなど）のみを残す

---

## 🟡 中優先度（設計改善）

### B-1: tag.service.ts の DRY 違反

**ファイル**: `backend/src/tag/tag.service.ts` L59-163

`assignTagsToEntity()` が memo と notebook を if/else で処理（100行超）。所有権検証ロジックが重複。

**対処**: エンティティ種別ごとにメソッド分割、または共通ロジックをジェネリクス化

---

### B-2: MemoEditor の肥大化

**ファイル**: `frontend/src/components/memo/MemoEditor.tsx`（278行）

以下の責務が1ファイルに混在:

- タイトル・コンテンツ・タグ・ノートブックの状態管理
- 変更検知ロジック（useEffect が2つに分散）
- 保存・削除の非同期処理
- キーボードショートカット処理

**対処**: `useMemoSave` カスタムフックに保存ロジックを抽出、フォームを別コンポーネント化

---

### B-3: レガシー sync エンドポイント

**ファイル**: `backend/src/auth/auth.controller.ts` L278-291

`sync-user`・`sync-user-with-invite` は「移行期間用」コメント付きで何もしない。

**対処**: 削除

---

### B-4: フィーチャーフラグの命名不統一

バックエンド: `OAUTH_X`, `PREMIUM_FEATURES`, `LEGACY_SYNC_ENDPOINTS`
フロントエンド: `OAUTH_X`, `PREMIUM_UI`, `DEV_TOOLS`

**対処**: A-1・A-2 の対処と合わせて不要なフラグを削除。残るフラグは命名規則を統一

---

### B-5: auth.service.ts の招待コード検証漏れ

**ファイル**: `backend/src/auth/auth.service.ts` L58-85

`register()` に `_invitationCode` 引数があるが使用されていない（アンダースコア付き）。検証は controller 層で行われており、設計パターンが逸脱している。

**対処**: controller の招待コード検証ロジックをサービス層に移動

---

## 🟢 低優先度（コード品質）

### C-1: alert() / window.confirm() の使用

**ファイル**: `frontend/src/components/memo/MemoEditor.tsx` L131, L150, L158

ブラウザネイティブの `alert()`/`confirm()` を使用。UX が悪い。

**対処**: トースト通知・確認モーダルコンポーネントを実装して置き換える

---

### C-2: DTO バリデーション不足

**ファイル**: `backend/src/memo/dto/create-memo.dto.ts`

`content` フィールドに `@IsOptional()` 等のバリデーションデコレータがなく、空文字列を受け入れる。

**対処**: `@IsOptional()` or `@IsNotEmpty()` を明示的に追加

---

### C-3: any 型キャスト

**ファイル**: `backend/src/theme/theme.service.ts` L225, L227, L267, L269

`styles: (createThemeDto.styles as any) || null` - 型定義をして `as any` を除去すべき

---

### C-4: エラーメッセージの言語混在

**ファイル**: `backend/src/tag/tag.service.ts` L86

英語メッセージ `'Some tags do not belong to you'` が混在。他は日本語。

---

### C-5: パスワードリセット未実装

**ファイル**: `backend/src/auth/auth.controller.ts` L165-201

TODO コメントあり。メール送信が実装されていない。フロントエンドにはUIが存在。

---

## 対処順序（Phase 0 への組み込み）

```
4月前半（リファクタリング）:
  [1] A-2: PREMIUMロール廃止 → USER/ADMIN に統一
  [2] A-1: X/Twitter コード全削除
  [3] B-3: レガシー sync エンドポイント削除
  [4] A-4: Zustand/React Query 責務明確化
  [5] A-3: InvitationManager を apiClient に統一

4月後半（新機能実装）:
  [6] 自動保存（cc-sddで仕様化）
  [7] ゴミ箱機能（cc-sddで仕様化）

後回し（5月以降）:
  B-1: tag.service.ts 分割
  B-2: MemoEditor 分割
  B-5: 招待コード検証をサービス層へ
  C-1〜C-5: コード品質改善
```

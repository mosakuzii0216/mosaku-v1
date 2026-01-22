# Mosaqu コードベース キャッチアップ計画

## 概要

バイブコーディングで開発してきたプロジェクトの理解を深めるための学習計画。
データモデル → 機能フロー → 実践課題 の順で進める。

---

## Phase 1: データモデルの理解

### 1.1 全体像

```
┌─────────────────────────────────────────────────────────────────┐
│                           User                                   │
│  - id, email, password, name, role(FREE/PREMIUM/ADMIN)          │
│  - oauthId (Google/GitHub/X でログイン用)                        │
└─────────────────────────────────────────────────────────────────┘
       │ 1:多 の関係（1人のユーザーが複数持てる）
       ├──────────────┬──────────────┬─────────────┐
       ▼              ▼              ▼             ▼
   ┌────────┐    ┌──────────┐    ┌─────┐    ┌────────────────┐
   │  Memo  │    │ Notebook │    │ Tag │    │ InvitationCode │
   └────────┘    └──────────┘    └─────┘    └────────────────┘
       │              │              │
       │              │              │
       └──────┬───────┘              │
              │                      │
              ▼                      │
    ┌─────────────────┐              │
    │ Memo ← Notebook │              │
    │ (メモはノート   │              │
    │  ブックに所属)  │              │
    └─────────────────┘              │
              │                      │
              └──────────┬───────────┘
                         ▼
              ┌─────────────────────┐
              │ MemoTag / NotebookTag│
              │ (多対多の中間テーブル)│
              └─────────────────────┘
```

### 1.2 主要モデル詳細

#### User（ユーザー）
- **場所**: `backend/prisma/schema.prisma:23-48`
- **役割**: 認証・認可の主体、すべてのデータの所有者
- **重要フィールド**:
  - `oauthId`: OAuth認証時のプロバイダーID
  - `password`: メール認証時のハッシュ化パスワード（nullable）
  - `role`: FREE / PREMIUM / ADMIN
  - `emailVerified`: メール認証済みフラグ

#### Memo（メモ）
- **場所**: `backend/prisma/schema.prisma:50-66`
- **役割**: メインコンテンツ
- **重要フィールド**:
  - `title`: 最大100文字
  - `content`: テキスト形式（TipTapリッチエディタで編集）
  - `notebookId`: 所属ノートブック（nullable = 未分類可）

#### Notebook（ノートブック）
- **場所**: `backend/prisma/schema.prisma:68-87`
- **役割**: メモをグループ化するフォルダ的存在
- **重要フィールド**:
  - `name`: ノートブック名
  - `themeId`: 適用テーマ（nullable）

#### Tag（タグ）
- **場所**: `backend/prisma/schema.prisma:104-118`
- **役割**: メモ・ノートブックの分類
- **重要フィールド**:
  - `name`: タグ名
  - `color`: 16進数カラーコード（#FF5733形式）

### 1.3 関係性のポイント

| 関係 | 型 | 削除時の挙動 |
|------|-----|-------------|
| User → Memo | 1:多 | Cascade（ユーザー削除でメモも削除） |
| User → Notebook | 1:多 | Cascade |
| User → Tag | 1:多 | Cascade |
| Notebook → Memo | 1:多 | SetNull（ノートブック削除でメモは未分類に） |
| Memo ↔ Tag | 多:多 | Cascade（どちらか削除で関連解除） |

### 1.4 確認課題

- [ ] Prisma Studioでデータを確認: `cd backend && npx prisma studio`
- [ ] 各テーブルのレコード数を確認
- [ ] MemoTagテーブルで多対多の関係を確認

---

## Phase 2: 機能フローの縦断的理解

### 2.1 メモ作成フロー（推奨: 最初に理解すべき）

```
[フロントエンド]                    [バックエンド]                 [DB]
     │                                  │                          │
     │ 1. 「新規作成」ボタンクリック      │                          │
     │    └→ useMemoStore で状態変更     │                          │
     │                                  │                          │
     │ 2. フォーム入力・送信             │                          │
     │    └→ POST /memos API呼び出し    │                          │
     │────────────────────────────────→│                          │
     │                                  │ 3. JwtAuthGuard で認証    │
     │                                  │ 4. MemoController.create()│
     │                                  │ 5. MemoService.create()   │
     │                                  │─────────────────────────→│
     │                                  │                    6. INSERT
     │                                  │←─────────────────────────│
     │←────────────────────────────────│ 7. 作成されたメモを返却    │
     │ 8. React Query がキャッシュ更新   │                          │
     │ 9. UI更新                        │                          │
```

#### 関連ファイル

**フロントエンド**:
- `frontend/src/stores/memoStore.ts` - 状態管理
- `frontend/src/components/memo/MemoEditForm.tsx` - 編集フォーム
- `frontend/src/hooks/useMemoQueries.ts` - API呼び出し

**バックエンド**:
- `backend/src/memo/memo.controller.ts` - エンドポイント定義
- `backend/src/memo/memo.service.ts` - ビジネスロジック
- `backend/src/memo/dto/create-memo.dto.ts` - 入力バリデーション

### 2.2 認証フロー

```
[OAuth認証の場合]
1. フロントエンド: 「Googleでログイン」クリック
2. → backend/auth/google にリダイレクト
3. → Google認証画面
4. → backend/auth/google/callback にリダイレクト
5. → JWTトークン生成、フロントエンドにリダイレクト
6. → フロントエンド: トークンをlocalStorageに保存
7. → 以降のAPIリクエストにAuthorizationヘッダー付与
```

#### 関連ファイル

**バックエンド**:
- `backend/src/auth/auth.controller.ts` - 認証エンドポイント
- `backend/src/auth/auth.service.ts` - 認証ロジック
- `backend/src/auth/strategies/` - Passport戦略（Google, GitHub, X）
- `backend/src/auth/guards/jwt-auth.guard.ts` - JWT認証ガード

**フロントエンド**:
- `frontend/src/contexts/AuthContext.tsx` - 認証状態管理
- `frontend/src/utils/authTokenManager.ts` - トークン管理

### 2.3 その他の主要フロー

追跡すべきフロー（優先度順）:
1. [ ] メモ一覧取得
2. [ ] メモ更新
3. [ ] メモ削除
4. [ ] ノートブック作成
5. [ ] タグ付け
6. [ ] テーマ切り替え

---

## Phase 3: 実践課題

理解度を確認するための小さな課題。

### 3.1 初級課題

#### 課題A: メモのタイトル文字数上限を変更
- **目標**: タイトル上限を100文字→150文字に変更
- **触るファイル**:
  - `backend/prisma/schema.prisma` - DBスキーマ
  - `backend/src/memo/dto/create-memo.dto.ts` - バリデーション
  - `backend/src/memo/dto/update-memo.dto.ts` - バリデーション
- **学べること**: スキーマ変更 → マイグレーション → DTO修正の流れ

#### 課題B: タグの色に新しいデフォルト値を追加
- **目標**: タグ作成時、色未指定なら `#6B7280` をデフォルトに
- **触るファイル**:
  - `backend/src/tag/tag.service.ts`
- **学べること**: サービス層でのデフォルト値設定

### 3.2 中級課題

#### 課題C: メモに「お気に入り」機能を追加
- **目標**: メモにisFavoriteフラグを追加し、お気に入り一覧を取得できるように
- **触るファイル**:
  - `backend/prisma/schema.prisma` - フィールド追加
  - `backend/src/memo/memo.service.ts` - ロジック追加
  - `backend/src/memo/memo.controller.ts` - エンドポイント追加
  - フロントエンド各所
- **学べること**: 新機能追加のフルスタックフロー

### 3.3 上級課題

#### 課題D: メモの検索機能を実装
- **目標**: タイトル・本文でメモを全文検索
- **学べること**: クエリ最適化、フロントエンドの検索UI

---

## Phase 4: コードリーディングのコツ

### NestJSバックエンドの読み方

```
Module（モジュール）
  └→ Controller（エンドポイント定義）
       └→ Service（ビジネスロジック）
            └→ Prisma（DB操作）
```

1. **Controller**から読み始める: どんなAPIがあるか把握
2. **DTO**を確認: 入出力の形を理解
3. **Service**を読む: 実際の処理内容

### Reactフロントエンドの読み方

```
pages/（ページコンポーネント）
  └→ components/（UIパーツ）
       └→ hooks/（ロジック）
            └→ stores/（状態管理）
```

1. **ページ**から読み始める: 画面構成を把握
2. **Store**を確認: どんな状態があるか
3. **Hooks**を読む: API呼び出しとデータフロー

---

## 進捗チェックリスト

### Phase 1: データモデル
- [ ] schema.prismaを読んだ
- [ ] Prisma Studioでデータを確認した
- [ ] 各モデルの関係を説明できる

### Phase 2: 機能フロー
- [ ] メモ作成フローを追跡した
- [ ] 認証フローを理解した
- [ ] JWTトークンの流れを説明できる

### Phase 3: 実践
- [ ] 課題Aを完了した
- [ ] 課題Bを完了した
- [ ] 課題Cを完了した（オプション）

---

## 質問テンプレート

理解が曖昧な部分は、以下の形式で質問すると効率的：

```
【対象】このファイル/この関数
【現状の理解】〇〇だと思っている
【疑問点】△△がわからない
```

---

*最終更新: 2025-01-20*

# Implementation Gap Analysis — memo-public-sharing

## Analysis Summary

- **スコープ**: メモ単体の Unlisted URL 公開（`/p/{token}`）。所有者のトグル・再生成・一覧管理 / 未ログイン閲覧（読み取り専用）/ ゴミ箱連動 / レート制限 / 観測性 が要件。
- **既存資産の充足度は高い**: グローバル JWT Guard + `@Public()` opt-out、`AuthorizationService.checkOwnership`、`@nestjs/throttler` のグローバル登録、Sentry `feature_area` 規約、React Query `queryKeys.memos.*` の階層キャッシュ、`apiClient.requestPublic` などが揃っており、公開機能は既存パターンに沿って薄く乗せるだけで成立する。
- **新規追加が必要なもの**: (1) Memo に公開メタデータを持たせるスキーマ、(2) 暗号学的に推測困難なトークン生成、(3) 公開閲覧用 Controller + 専用 DTO（個人情報を含めない最小レスポンス）、(4) `/p/:token` ルートと `PublicMemoView` コンポーネント、(5) ダッシュボード上の公開メモ管理 UI、(6) `queryKeys.memos.public*` キャッシュキーと不変則整備。
- **主な複雑点**: ゴミ箱遷移と公開状態の連動（Req 1.5 / 1.6）、未ログイン IP レート制限（Req 3.6）、公開ビューでの TipTap HTML 安全表示、非公開化直後の閲覧者を切るキャッシュ制御（Req 6.3）。
- **推奨**: スキーマは **Option A (Memo モデルに `publicToken` / `publishedAt` カラム追加)**。サービス・コントローラは **Option C-Lite (既存 MemoModule 内で `MemoSharingService` / `PublicMemoController` を分離)** が SRP とテスト容易性で優位。

## Document Status

- 入力: `requirements.md` (v1, requirements-generated, 未承認)、ステアリング `product.md` / `tech.md` / `structure.md` / `dogfooding.md`、コードベース全文。
- 分析手順: `.kiro/settings/rules/gap-analysis.md` のフレームワークに準拠。Requirement→Asset Map → Options A/B/C → Effort/Risk → Research Needed の順で構成。
- 未確定領域は §6 "Research Needed" にまとめ、design フェーズへ持ち越す。

---

## 1. Current State Investigation

### 1.1 バックエンド（NestJS / Prisma / PostgreSQL）

| カテゴリ          | 既存資産                                                                                                                                                                                                                                                     | 公開機能で使える点                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ドメイン構造      | `backend/src/memo/` に `memo.module.ts` / `memo.service.ts` (340行) / `memo.controller.ts` (146行) / `trash-cleanup.service.ts` / `dto/`                                                                                                                     | 公開機能を memo ドメインに同居させても肥大しすぎない。サービス層を分離してテストを薄く保つ余地あり                                             |
| 所有権            | `AuthorizationService.validateOwnership(entity, userId, name)` を `common/services/` で一元化                                                                                                                                                                | Req 1.4 をワンライナで実装可能                                                                                                                 |
| 基底クラス        | `BaseOwnableService<T>` (`memo.service.ts:21`) が CRUD と所有権検証を提供                                                                                                                                                                                    | 公開系メソッドは Memo を取得する経路を共通化可能                                                                                               |
| 認証              | `JwtAuthGuard` を `APP_GUARD` に登録 (`app.module.ts:50`)。`@Public()` は `SetMetadata('isPublic', true)` (`common/decorators/public.decorator.ts`)。`JwtAuthGuard.canActivate` で reflector チェック                                                        | Req 3.4 をそのまま満たす                                                                                                                       |
| レート制限        | `ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 30 }])` + APP_GUARD の `ThrottlerGuard`。個別ハンドラは `@Throttle({ default: { ttl, limit } })` で上書き（既存例: `auth.controller.ts:88` 他）。`ThrottlerExceptionFilter` でレスポンス整形 | Req 3.6 を Decorator + env で実装可能                                                                                                          |
| エラー応答        | `ERROR_CODES`, `throwNotFound`, `throwForbidden`, `throwConflict` (`common/exceptions/`) で構造化                                                                                                                                                            | Req 3.3 の "公開メモの有無を区別できない 404" には `throwNotFound(ERROR_CODES.RESOURCE.NOT_FOUND, 'Memo not found')` を使えば既存 UI と整合    |
| Sentry            | `feature_area: 'memo' \| 'notebook' \| 'tag' \| 'theme' \| 'auth' \| 'invitation' \| 'system' \| 'unknown'` の固定 enum (`common/sentry/sentry-tags.ts`)、URL→area マップは `/memo[s]` プレフィックスを `memo` に解決                                        | Req 6.1 / 6.4 は `Sentry.captureMessage(..., { tags: { feature_area: 'memo' } })` パターン (`auth/refresh-token.service.ts:78`) と同型で書ける |
| URL/ConfigService | `ConfigService.corsOrigins`、フロントエンドは `getAppUrl()`/`getBackendUrl()` で env 由来                                                                                                                                                                    | Req 5.3 の完全公開 URL はフロント側で `${getAppUrl()}/p/${token}` を組むだけで足りる                                                           |
| Soft Delete       | `Memo.trashedAt` カラム、`MemoService.trash/restore/permanentDelete`、cron `trash-cleanup.service.ts`                                                                                                                                                        | Req 1.5/1.6 は `trash()` への副作用追加または `MemoSharingService.unpublishCascade(memoId)` を呼ぶ形で接続できる                               |
| Helmet/CORS       | `main.ts` で適用済み、`Content-Security-Policy` も設定済み                                                                                                                                                                                                   | 公開ビュー HTML は `defaultSrc 'self'` の範囲内で問題なし（外部画像のみ `imgSrc: 'https:'` 許可済み）                                          |

### 1.2 フロントエンド（React 19 / Vite / React Query / Zustand）

| カテゴリ          | 既存資産                                                                                                                                                           | 公開機能で使える点                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ルーティング      | `App.tsx` で `BrowserRouter`。AuthGuard 外ルート: `/auth/callback`, `/auth/reset-password`, `/invite/:code`（既存パターン）                                        | 同じ階層に `/p/:token` を素直に追加可能                                                                                                                                          |
| API クライアント  | `utils/api.ts` の `apiClient`（singleton）。`requestPublic` / `requestWithOptionalAuth` / `request`（REQUIRED）の 3 段階                                           | 公開閲覧 API は `requestPublic` を使う。`/invitation/verify` 等と同じ流儀                                                                                                        |
| React Query       | `useMemoQueries.ts` で `useMemos / useMemo / useUpdateMemo / useDeleteMemo` 等。`queryKeys.memos.{all,list,detail,trash,search}` の階層 (`constants/queryKeys.ts`) | `queryKeys.memos.publicList()` / `queryKeys.memos.publicDetail(token)` を追加。invalidation は既存 `queryKeys.memos.list()` / `detail(id)` と組み合わせる                        |
| MemoBridge        | `utils/memo/memo-bridge.ts` がオフライン同期込みの API ゲートウェイ                                                                                                | **公開機能は閲覧者がオフラインキャッシュを持たない + 編集者の公開トグルは認証必須なので、Bridge を経由する必要はない**。`apiClient` 直叩きで簡潔に書ける。判断は design フェーズ |
| エディタ          | `RichTextEditor`（`components/editor/RichTextEditor.tsx`）は TipTap ベース。`editable` / 読み取り専用モードの実装可否は design で確認要                            | Req 4.3 の閲覧専用ビュー実装で再利用候補                                                                                                                                         |
| 設定ページ        | `SettingsPage` (`components/settings/SettingsPage.tsx`) は `InvitationCard` + `DebugPanel` の単純構成                                                              | Req 5 の公開メモ管理ダッシュボードは同ページに `PublicMemosCard` を増やす形で素直に乗る                                                                                          |
| 完全 URL 組み立て | `getAppUrl()` (`utils/env.ts:191`)                                                                                                                                 | Req 5.3 を満たす                                                                                                                                                                 |
| Sentry route tag  | `useSentryRouteTag` (`hooks/useSentryRouteTag.ts`)                                                                                                                 | 公開ルートも追加で route タグ送出可能                                                                                                                                            |

### 1.3 規約・不変則（CLAUDE.md / steering）

- **API は `apiClient` 経由**（直接 `fetch` 禁止）
- **所有権チェックは `AuthorizationService.checkOwnership`** で一元化
- **認証はグローバル JWT Guard + `@Public()` opt-out**
- **Sentry 初期化は `main.ts` の最初**
- **`React Query` がサーバー状態の真実の源泉**、Zustand へコピー禁止
- **コミット規約**: `feat(backend/memo): ...` / `feat(frontend/memo): ...`
- **仕様駆動開発**: requirements → design → tasks → impl の順（人間承認必須）

---

## 2. Requirement-to-Asset Map

凡例: ✅ 既存資産で充足 / 🟡 既存パターンの拡張 / 🆕 新規実装 / ❓ 要研究

| Req                                | 概要                                                                                                                                                             | 主要資産 / ギャップ                                    | タグ |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---- |
| 1.1 公開化                         | `MemoService.findOne` + 新規 `publish(id, userId)` でトークン発行                                                                                                | 🆕 サービス・コントローラ・DTO                         |
| 1.2 非公開化                       | `unpublish(id, userId)` でトークン無効化                                                                                                                         | 🆕                                                     |
| 1.3 非公開時 404                   | 公開閲覧サービスで `publicToken IS NULL` を 404 化                                                                                                               | 🆕                                                     |
| 1.4 所有者でない場合の拒否         | `AuthorizationService.validateOwnership` を使うだけ                                                                                                              | ✅                                                     |
| 1.5 ゴミ箱内は公開不可             | `MemoService` の既存 `findOne` が `trashedAt: null` 限定。公開化サービス側で同 where を使えば自然に達成                                                          | 🟡                                                     |
| 1.6 公開中→ゴミ箱で自動非公開      | `MemoService.trash` を拡張、または `MemoSharingService.unpublishIfPublished(id)` を `trash` から呼ぶ                                                             | 🟡                                                     |
| 2.1 128bit エントロピー / 1 本     | `crypto.randomBytes(32).toString('base64url')` (256bit, base64url)                                                                                               | 🆕（標準 lib のみ）                                    |
| 2.2 再生成                         | `regenerateToken(id, userId)`                                                                                                                                    | 🆕                                                     |
| 2.3 衝突回避                       | Prisma `@@unique([publicToken])` + `P2002` 捕捉でリトライ                                                                                                        | 🟡（既存 invitation/code-generator.ts に近似実装あり） |
| 2.4 トークンに識別情報含めない     | 完全ランダム生成で自動充足                                                                                                                                       | ✅                                                     |
| 2.5 ユニーク制約                   | `publicToken String? @unique`                                                                                                                                    | 🆕（マイグレーション）                                 |
| 3.1 未ログイン閲覧                 | `@Public()` + 専用 Controller                                                                                                                                    | ✅(枠組み) / 🆕(実装)                                  |
| 3.2 個人情報不含                   | 専用 DTO `PublicMemoDto { title, content, updatedAt }` のみ返す                                                                                                  | 🆕                                                     |
| 3.3 404 応答                       | `throwNotFound` で `Memo not found` 統一                                                                                                                         | ✅                                                     |
| 3.4 `@Public()` opt-out            | デコレータ既存                                                                                                                                                   | ✅                                                     |
| 3.5 ログイン状態問わず同一ビュー   | フロントの `/p/:token` を AuthGuard 外に置く（既存 `/invite/:code` と同パターン）                                                                                | ✅(枠組み)                                             |
| 3.6 IP 単位レート制限              | `@Throttle({ default: { ttl, limit } })` を公開閲覧ハンドラに付与。デフォルト tracker は IP ベース                                                               | 🟡 / ❓ tracker 振る舞いの最終確認                     |
| 4.1 読み取り専用エンドポイントのみ | 公開閲覧 Controller には GET のみ実装                                                                                                                            | ✅                                                     |
| 4.2 書き込みは 401/403             | 既存メモ Controller は `@UseGuards(JwtAuthGuard)`、公開閲覧 Controller には書き込み無し                                                                          | ✅                                                     |
| 4.3 UI 上に編集 UI 等を出さない    | `PublicMemoView` を新規。`MemoEditor` の再利用は避け、読取り専用レンダラを別途用意                                                                               | 🆕 / ❓ TipTap readonly 採用可否                       |
| 4.4 招待制サインアップ導線         | 公開ビューに `/invite` 説明文と Mosaku への CTA を表示                                                                                                           | 🆕（コピー検討）                                       |
| 5.1 公開メモ一覧                   | `getMyPublicMemos(userId)`: `publishedAt DESC`                                                                                                                   | 🆕                                                     |
| 5.2 各操作                         | コピー / 再生成 / 解除                                                                                                                                           | 🆕（UI）                                               |
| 5.3 完全 URL を返却可能に          | フロントで `${getAppUrl()}/p/${token}` 組み立て                                                                                                                  | ✅                                                     |
| 5.4 空状態                         | `EmptyState` を実装                                                                                                                                              | 🆕（UI）                                               |
| 5.5 編集画面からも切替可           | `MemoEditor` のヘッダーに「公開」トグル + ステータス表示                                                                                                         | 🟡                                                     |
| 6.1 Sentry イベント記録            | `Sentry.captureMessage('memo_public_published', { tags: { feature_area: 'memo' } })`                                                                             | ✅(パターン) / 🆕(箇所追加)                            |
| 6.2 React Query キャッシュ無効化   | mutation `onSuccess` で `queryKeys.memos.detail(id)` + `queryKeys.memos.publicList()` を invalidate                                                              | ✅(パターン) / 🆕(キー定義)                            |
| 6.3 公開閲覧の Cache-Control       | NestJS で `res.setHeader('Cache-Control', 'public, max-age=60')` 等。`@Header` デコレータ可                                                                      | 🆕 / ❓ CDN との相互作用                               |
| 6.4 例外時 user_facing タグ        | Sentry の既存 `applyStandardTags`（`common/sentry/sentry-tags.ts:65`）が `status_code 5xx` を `user_facing: true` に自動付与。明示的に上書き必要なケースのみ追記 | ✅                                                     |

---

## 3. Implementation Approach Options

### 3.1 データモデル

#### Option A (推奨): `Memo` に `publicToken` / `publishedAt` を追加

```prisma
model Memo {
  // ...既存...
  publicToken String?   @unique @map("public_token") @db.VarChar(64)
  publishedAt DateTime? @map("published_at")
}
```

- **トレードオフ**:
  - ✅ マイグレーション 1 本、`Memo` への JOIN 不要、最小実装
  - ✅ Req 2.1/2.5（unique, 1 本）を直接表現
  - ✅ 既存 `findOne` の `select`/`include` を一切変えなくても返却を増やせる
  - ❌ Memo モデルが将来 "公開系メタデータ" を肥大化させる懸念（visit count, last accessed at, expires at 等を入れたくなったとき）
  - ❌ 非公開メモの行にも常時 NULL カラムが付く（軽微）

#### Option B: `MemoShare` テーブル分離（1:1）

```prisma
model MemoShare {
  memoId      String   @id @map("memo_id")
  publicToken String   @unique @map("public_token") @db.VarChar(64)
  publishedAt DateTime @default(now()) @map("published_at")
  memo        Memo     @relation(fields: [memoId], references: [id], onDelete: Cascade)
  @@map("memo_shares")
}
```

- **トレードオフ**:
  - ✅ 関心の分離。将来 visit count / 期限付き共有 / 共有先メールアドレス指定 等を増やしても Memo を汚さない
  - ✅ 非公開メモには行が存在しない → セマンティクスが明確
  - ❌ JOIN または別 fetch が必要、Prisma の `include` 設計が増える
  - ❌ 1:1 関係を将来 1:N（履歴）にスライドさせる選択肢を残せる反面、過剰設計の可能性

#### Option C: `MemoShare` 多対1（履歴あり）

- 1 メモに対して複数のトークン（active 1 + revoked N）を保持。Req 2.1 "1 本だけ保持" に違反するため要件範囲外。**採用しない**。

**推奨**: **Option A**（最小・要件充足・既存パターンに最も近い）。将来の拡張ニーズが顕在化した時点で Option B にリファクタする道筋は残せる。

### 3.2 サービス・コントローラ構成

#### Option A: `MemoService` に公開系メソッドを足す

- **メリット**: ファイル数最小
- **デメリット**: 既に 340 行ある `memo.service.ts` がさらに肥大化。`BaseOwnableService` の責務（汎用 CRUD）と "公開機能" の責務が混ざる。テストが大きくなる。

#### Option B: 完全に別モジュール（`MemoSharingModule`）に切り出す

- **メリット**: 完全な分離
- **デメリット**: Prisma の `Memo` を参照するためのモジュール境界が冗長。"memo ドメイン" 1 モジュールという steering 方針に反する。

#### Option C (推奨): `memo` モジュール内で **`MemoSharingService` + 専用 Controller** を分離

```
backend/src/memo/
├── memo.module.ts                        // 既存。providers に MemoSharingService 追加、controllers に PublicMemoController 追加
├── memo.service.ts                       // 既存。trash() から MemoSharingService.unpublishIfPublished() を呼ぶだけ追加
├── memo.controller.ts                    // 既存（所有者向け）。memos/:id/publish 系 endpoint をここに集約 or owner-sharing.controller.ts に分離
├── memo-sharing.service.ts               // 新規。publish / unpublish / regenerate / list / findByToken
├── public-memo.controller.ts             // 新規。@Public() 付き GET /p/:token のみ
└── dto/
    ├── publish-memo.response.dto.ts      // 新規（所有者向け）
    └── public-memo.response.dto.ts       // 新規（閲覧者向け、個人情報を含めない最小スキーマ）
```

- **メリット**:
  - SRP（Memo CRUD と Memo Sharing の分離）
  - テスト粒度を保てる（`memo-sharing.service.spec.ts` 単独で公開ロジックを検証）
  - `PublicMemoController` を独立させることで `@Public()` 適用範囲が明示的
  - 既存の `theme.controller.ts` の `@Public()` 運用と一貫
- **デメリット**: ファイル増（許容範囲）

**推奨**: **Option C**。

### 3.3 公開 URL のパス設計

- 要件は `/p/{token}`（フロントエンドルート）。バックエンド REST は別の関心。
- **A: バックエンドも `/p/:token`** → `feature_area` 解決（`common/sentry/sentry-tags.ts:24`）の prefix にマッチしないため、Sentry tag が `unknown` になる
- **B: バックエンド `/memos/public/:token`** → `feature_area: memo` に自動分類される（`/memos/` プレフィックスに合致）、`feature_area` 規約を変えずに済む
- **推奨**: **B**。フロント `/p/:token` → 内部で `apiClient.getPublicMemo(token)` → `GET /memos/public/:token` を叩く。Sentry の URL→area 規約は据え置き。

### 3.4 公開ビューの本文レンダリング ❓

- **A: TipTap を `editable: false` で再利用** → 既存 RichTextEditor をそのままマウント。スタイル一貫。ただし TipTap の依存と Editor インスタンスを読み取り専用のためだけに起動するコスト。
- **B: HTML を直接表示（`dangerouslySetInnerHTML` + DOMPurify）** → 依存追加（DOMPurify）。XSS 対策のサニタイズが必要。バンドル小。
- **C: HTML を直接表示（TipTap が出す HTML を信頼）** → 自分のメモは TipTap が生成した HTML だが、公開閲覧では万一の XSS リスクを避けたい。
- **判断は design フェーズに持ち越し**。Req 3.2 / 4.3 の観点で最低限「閲覧専用に見える UI」を提供できればどちらでも要件は満たせる。

### 3.5 ゴミ箱連動（Req 1.6）

- **A (推奨): `MemoService.trash` から `MemoSharingService.unpublishIfPublished(id, userId)` を呼ぶ**
  - 明示的・テスト容易
  - 既存 `trash()` のテスト (`memo.service.spec.ts`) に対する追加検証が必要
- **B: Prisma middleware で `trashedAt` 更新時に `publicToken=null` をセット**
  - DRY だが暗黙的でデバッグが難しい。本プロジェクトの規約には合わない
- **C: cron `trash-cleanup.service.ts` での物理削除時のみ非公開化**
  - Req 1.6 "ゴミ箱に移動されたとき" を満たさない（即時性が無い）

**推奨**: **A**。

### 3.6 レート制限（Req 3.6）

- `@nestjs/throttler` の `ThrottlerGuard` はデフォルトで `req.ip` を tracker に使う（`@nestjs/throttler` 標準実装）
- `@Throttle({ default: { ttl: 60_000, limit: 60 } })` のように装飾する形が `auth.controller.ts` の既存パターンと整合
- `THROTTLE_CONFIG` (`config/auth-constants.ts:42`) と同様、env 経由で調整可能にすると運用性向上
- ❓ Cloud Run 経由で `X-Forwarded-For` の信頼が必要 → `app.set('trust proxy', ...)` の有無は design で確認

### 3.7 キャッシュ制御（Req 6.3）

- 公開閲覧レスポンスに `Cache-Control: public, max-age=60`（短時間） + `Vary: Accept` 程度
- 非公開化直後にキャッシュが残るリスクと、所有者の負荷低減のトレードオフ
- ❓ Vercel/Cloud Run/Cloudflare などの CDN レイヤとの相互作用は design で確認（"公開メモの本体は CDN にキャッシュさせていいのか" の判断）

---

## 4. Implementation Complexity & Risk

| 観点       | 評価             | 根拠                                                                                                                                                                                                        |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Effort** | **M (3–7 days)** | スキーマ追加 + サービス分離 + Controller 2 つ（所有者向け / 公開向け）+ DTO + フロントの新規ルート/ビュー + ダッシュボード + 配線。既存パターンに沿うが範囲は広い                                           |
| **Risk**   | **Medium**       | 大半は既存パターンの拡張（Low）だが、(a) 公開閲覧の HTML 安全表示、(b) 非公開化直後のキャッシュ整合、(c) ゴミ箱連動の副作用設計、(d) IP レート制限の Cloud Run 上の挙動、の 4 点が新規判断を伴うため Medium |

---

## 5. Recommendations for Design Phase

### 5.1 推奨アプローチのまとめ

1. **データモデル**: Option A（`Memo` に `publicToken` / `publishedAt` を追加）
2. **構成**: Option C（`MemoSharingService` + `PublicMemoController` を `memo` モジュール内で分離。所有者向けエンドポイントは既存 `MemoController` への増設 or `OwnerSharingController` への分離を design で確定）
3. **URL 設計**: フロント `/p/:token` / バックエンド `GET /memos/public/:token`（Sentry の `feature_area: memo` に自動分類されるパス）
4. **ゴミ箱連動**: `MemoService.trash()` → `MemoSharingService.unpublishIfPublished()` の明示的呼び出し
5. **レート制限**: `@Throttle({ default: { ttl, limit } })` を公開閲覧ハンドラに装着、env で調整可能（`THROTTLE_CONFIG` 拡張）
6. **トークン**: `crypto.randomBytes(32).toString('base64url')` を採用、`P2002` 捕捉でリトライ
7. **Sentry**: `feature_area: 'memo'` で `memo_public_published` / `memo_public_unpublished` / `memo_public_token_regenerated` の 3 イベントを `captureMessage(level: 'info')`、例外は標準フィルタ + `applyStandardTags` に任せる
8. **React Query**:
   - 新キー: `queryKeys.memos.publicList()`（所有者向け公開メモ一覧）/ `queryKeys.memos.publicView(token)`（閲覧者向け）
   - 既存キー `queryKeys.memos.detail(id)` + 新キー `publicList()` を同一 mutation の `onSuccess` で invalidate
9. **フロントエンドの構成**:
   - 新規ルート `/p/:token` を AuthGuard 外に配置（`App.tsx` の `Routes` に追加）
   - 新規コンポーネント `PublicMemoView`（本文レンダラ + サインアップ CTA）
   - `MemoEditor` のヘッダーに「公開」トグル + 共有メニュー（再生成 / 解除 / コピー）
   - `SettingsPage` に `PublicMemosCard`（一覧 + 各種操作）
10. **コミット粒度**: 仕様駆動の規約に従い 1 Todo = 1 Commit、`feat(backend/memo)` / `feat(frontend/memo)` スコープ

### 5.2 Research Needed（design へ持ち越し）

1. **公開ビューの本文レンダリング**: TipTap `editable:false` vs DOMPurify による直接 HTML 表示の選定（バンドルサイズ・XSS 安全性・スタイル一貫性の比較）
2. **キャッシュ制御**: 公開閲覧レスポンスの `Cache-Control` 値と Cloud Run / Vercel / 中間 CDN の相互作用。非公開化直後の閲覧切断保証
3. **IP レート制限の Cloud Run 上挙動**: `X-Forwarded-For` の信頼設定（Express の `trust proxy`）と ThrottlerGuard の tracker（`getTracker` を明示的に override すべきか）
4. **公開メモのテーマ/ノートブック表示**: 閲覧者にノートブック名やテーマを公開するか（要件は title/content/updatedAt のみ言及）→ design で要件追補の必要性を確認
5. **公開メモが多数あるユーザーの一覧**: ページネーション要否（要件 5.1 は "全ての公開中メモを最終公開日時の降順" のみ）、`/memos/me/public-memos` のような新エンドポイント設計
6. **OG タグ / OGP**: 共有用の `<meta property="og:title">` 等の生成方針（Vite SPA で SSR なし）。MVP では未対応で問題ないが要件で明示するか判断
7. **トークンの URL 長**: base64url(32 バイト) = 43 文字。短縮要望が出るか確認（要件 2.1 は最低 128bit エントロピー）
8. **公開メモのコンテンツ重さ**: 本文を毎回返すか / 圧縮ヘッダー（gzip）。NestJS 既定の挙動で十分か

### 5.3 制約・既知のアセット境界

- **Zustand への Memo 公開状態コピー禁止**（CLAUDE.md 不変則）: 公開状態は React Query キャッシュ＋サーバーが真実の源泉
- **直接 fetch 禁止**: 公開閲覧 API は `apiClient.requestPublic` ラッパを使う
- **`AuthorizationService` 経由の所有権検証必須**: 公開化・再生成・解除サービスメソッドで遵守
- **Sentry `feature_area` enum 固定**: 公開機能の追加で enum を増やさない（`memo` のままで OK）
- **`@Public()` opt-out 方式**: 新規追加する `PublicMemoController` の各ハンドラに `@Public()` を明示

---

## 6. Next Steps

1. 本ギャップ分析の内容を踏まえて要件レビュー → 必要なら `requirements.md` を補強（Research Needed §6.4 / §6.6 / §6.7 など）
2. `/kiro:spec-design memo-public-sharing` で技術設計を起こす
3. design で §5.2 の Research Needed を解消した上で `tasks.md` 生成へ進む

---

_本ドキュメントは情報提供を目的とし、最終的な実装選択は design フェーズの議論・承認を経て決定する。_

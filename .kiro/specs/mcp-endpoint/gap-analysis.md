# Implementation Gap Analysis — mcp-endpoint (v1)

> 対象: `.kiro/specs/mcp-endpoint/requirements.md`（requirements-generated / 未承認）
> 目的: 承認済み要件と既存コードベースの差分を可視化し、design フェーズの判断材料を提供する。
> 注: 本書は **意思決定ではなく情報提供**。最終的な実装方針は design で確定する。

---

## 1. Analysis Summary

- mosaku を「AIの外付け脳みそ」にするリモート MCP サーバー（Streamable HTTP + OAuth 2.1）を backend（NestJS / Cloud Run）に追加する。tool は `create_memo`（write）/ `search_memos`（read）の2つ。
- **メモ/ノート/所有権/レート制限/Sentry の基盤はほぼ全部揃っている**。`MemoService.create` / `MemoService.search` / `AuthorizationService.validateOwnership` / `@nestjs/throttler` / `SentryGlobalFilter` をサーバー直呼びで再利用できる（Req 3/4/5/6/7 の大半は既存資産でカバー）。
- **最大の谷は Req 2（OAuth 2.1 認可）**。mosaku は現在 OAuth の _クライアント_（passport で Google 等にログイン）でしかなく、MCP クライアント（Claude Code / claude.ai）に対する **OAuth 認可サーバー（Authorization Server）ではない**。DCR・各種 `.well-known` メタデータ・PKCE・authorize/token エンドポイントが新規に必要。
- **MCP プロトコル層は完全に新規**（`@modelcontextprotocol/sdk` 未導入）。Streamable HTTP トランスポートを NestJS（Express アダプタ）にマウントする結線が要研究。
- 総合: **Effort M〜L / Risk Medium**。メモ機能側は Low、OAuth 認可サーバー化が High リスクの主因。MVP では OAuth スコープをどこまで実装するか（特に DCR とメタデータ）の線引きが設計の肝。

---

## 2. Requirement-to-Asset Map

| Req                                          | 必要な技術要素                                                                                                              | 既存資産（再利用可）                                                                                                                                      | ギャップ判定                                                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** MCP エンドポイント（Streamable HTTP） | MCP `initialize` / `tools/list` / JSON-RPC エラー、Streamable HTTP トランスポート                                           | NestJS + Express アダプタ（`main.ts`）。`@Public()` で既存 JWT Guard を opt-out 可（`public.decorator`）                                                  | **Missing**: `@modelcontextprotocol/sdk`、トランスポート結線、MCP モジュール一式                                                                                                                  |
| **R2** OAuth 2.1 認可                        | AS メタデータ（RFC 8414）/ Protected Resource メタデータ（RFC 9728）/ DCR（RFC 7591）/ authorize+token / PKCE / Bearer 検証 | `JwtStrategy`（Bearer 検証）、`JwtTokenService`（署名）、`RefreshTokenService`、既存ソーシャルログイン（ユーザー認証の入口）、`ConfigService` の URL 生成 | **Missing（最大）**: mosaku を OAuth **認可サーバー**にする層が丸ごと無い。**Constraint**: 既存は「ログイン後に mosaku JWT を発行」する設計で、第三者クライアント向けトークン発行・同意画面が無い |
| **R3** `create_memo`（write）                | content 必須 / notebook 任意 / 既定保存先 / 同一データ表現                                                                  | **`MemoService.create(dto, userId)`** がほぼそのまま使える。`NotebookService.findOne` で所有権付き notebook 解決                                          | **Missing**: 「notebook 未指定時の既定保存先（Inbox/受け皿）」の仕様・実装。`title` 必須（`@db.VarChar(100)`）だが MCP 入力は content のみ → **title 自動生成ルール**が要設計                     |
| **R4** `search_memos`（read）                | query 必須 / 自分のメモのみ / ゴミ箱除外 / 件数上限 / 抜粋メタデータ                                                        | **`MemoService.search(query, userId)`** が userId 限定 + `trashedAt: null` 済み。`searchPaginated` で件数上限も実現可                                     | **Missing**: MCP 向けの結果整形（id/抜粋/メタデータの contract）、上限値の確定。**Constraint**: 現状は Postgres `contains`（部分一致）のみ＝semantic 検索は無い                                   |
| **R5** 所有権・データ境界                    | 全 tool で `validateOwnership()` / サービス直呼び / 不変則準拠                                                              | **`AuthorizationService.validateOwnership()`** 一元化済み。`MemoService`/`NotebookService` は `BaseOwnableService` 継承で所有権担保                       | ギャップ小。MCP の userId をどこから注入するか（OAuth トークン→ユーザー解決）の結線のみ                                                                                                           |
| **R6** レート制限・濫用対策                  | tool 実行へのスロットリング / 既存基盤利用                                                                                  | **`@nestjs/throttler`** グローバル適用済み、`@Throttle()` で個別上書き可、`ThrottlerExceptionFilter` あり                                                 | **Missing**: MCP 用の throttle 値定義（`THROTTLE_CONFIG` に追加）、ユーザー単位 keying の検討                                                                                                     |
| **R7** エラー・観測性                        | MCP 準拠エラー / 内部詳細秘匿 / Sentry / 構造化タグ                                                                         | `SentryGlobalFilter`、`sentry-tags`（`feature_area` enum）、`AppLogger`、`sentry-scrubber`                                                                | **Constraint**: `feature_area` enum に `mcp` が無い（現状 `memo`/`notebook`/`tag`/`theme`/`auth`/`invitation`/`system`/`unknown`）→ enum 拡張要。MCP の JSON-RPC エラー整形は新規                 |
| **R8** 提供形態（定額・従量なし）            | mosaku 側で LLM 推論を呼ばない / 従量計測不要                                                                               | 設計上の制約で、追加実装ほぼ不要（mosaku は保存・検索のみ）                                                                                               | ギャップなし（アーキ上の確認事項）                                                                                                                                                                |

凡例: **Missing**=未実装 / **Constraint**=既存設計からの制約 / **Unknown**=design で要研究

---

## 3. Current State の要点（再利用できる足場）

- **認証**: グローバル `JwtAuthGuard`（`app.module.ts`）+ `@Public()` opt-out。Bearer JWT は `JwtStrategy`（`passport-jwt`, `secretOrKey: jwtSecret`）で検証し `AuthenticatedUser` を解決。**MCP の Bearer も同方式で検証できる**のが効く。
- **トークン発行**: `JwtTokenService.generateTokens(userId, email, role)`（payload `{ sub, email, role }`, 既定 15m）。MCP アクセストークンを mosaku JWT として発行すれば検証経路を流用可能。
- **メモ作成/検索**: `MemoService.create` は `{ title, content, userId, notebookId? }` を受ける（**title 必須**）。`MemoService.search` は userId + `trashedAt: null` + title/content の `contains`（大文字小文字無視）。`searchPaginated` で `take` 上限あり。
- **所有権**: `AuthorizationService.validateOwnership(entity, userId, name)` が NotFound/Forbidden を一元送出。`MemoService`/`NotebookService` は `BaseOwnableService` 継承。
- **データモデル**: `Memo`（title `VarChar(100)` / content / userId / notebookId? / trashedAt?）、`Notebook`（userId / name? / themeId?）、`User`、`RefreshToken`。MCP 専用テーブル（OAuth クライアント登録・認可コード）は**存在しない**。
- **レート制限**: `ThrottlerModule.forRoot`（GLOBAL 60req/60s）+ `@Throttle()` 個別、`ThrottlerExceptionFilter`。
- **観測性**: `SentryGlobalFilter`（APP_FILTER）、構造化タグ契約 5 種（`feature_area` enum 固定）、`SentryUserContextInterceptor`。
- **インフラ**: Express アダプタ（`main.ts` で `helmet` / `cors` / `session` / `trust proxy`）。Streamable HTTP は Express の req/res で動かせる前提。

---

## 4. Implementation Approach Options

### Option A: 既存 auth/memo モジュールを拡張して MCP を相乗りさせる

- **内容**: `AuthModule` 内に OAuth 認可エンドポイント群を足し、`MemoController` 付近に MCP ハンドラを足す。
- ✅ 新規ファイル最小・既存 DI をそのまま使える
- ❌ `AuthController`（既に 667 行）と認可サーバー責務が混線。MCP プロトコル層と REST が同居して肥大化
- ❌ 単一責任を崩す。MCP 固有の依存（SDK・トランスポート）が auth に漏れる
- **適性**: 低（責務肥大が既に懸念）

### Option B: 独立した `McpModule`（+ 認可サーバー層）を新規作成 ★推奨ベース

- **内容**: `backend/src/mcp/` に MCP モジュール（`mcp.controller.ts` / `mcp.service.ts` / `tools/`）を新設。OAuth 認可サーバーは `backend/src/auth/mcp-oauth/`（または独立 `OAuthServerModule`）として分離。tool 実装は既存 `MemoService` / `NotebookService` を DI で直呼び。
- **結線**: `@Public()` で MCP/well-known ルートを JWT Guard から除外 → MCP 内で OAuth Bearer を独自検証（既存 `JwtStrategy` の検証ロジックを共有 or 専用 guard）。
- ✅ 責務分離（MCP プロトコル / OAuth AS / ドメインサービスが疎結合）
- ✅ 単体テスト容易、既存 REST 認証に無影響（R1.6 を満たしやすい）
- ✅ 「1ドメイン=1モジュール」の structure.md 規約に合致
- ❌ ファイル数増・OAuth AS のインターフェース設計に手間
- **適性**: 高

### Option C: ハイブリッド（MCP は新規モジュール / OAuth は段階導入）

- **内容**: Option B のモジュール構成を取りつつ、OAuth 2.1 を**フェーズ分割**。
  - Phase 1: 最小トークン発行（既存ログイン→同意→mosaku JWT を MCP トークンに流用、メタデータは最小限）で Claude Code 接続を通す
  - Phase 2: DCR（RFC 7591）/ 完全な `.well-known` メタデータ / claude.ai Custom Connector 自動接続対応を追加
- **リスク緩和**: feature flag（`features.config.ts` パターン）で MCP 入口を制御、Claude Code（手動 `claude mcp add`）→ claude.ai（自動 DCR）の順で段階公開。
- ✅ 最短で本命 Claude Code の体験を出せる / OAuth の重い部分を後ろ倒し
- ✅ ロールバック容易（flag off）
- ❌ メタデータ/DCR を後付けする分、クライアント互換の作り込みが2段階
- **適性**: 高（特に「まず Claude Code で動かす」という brainstorm の優先度に合致）

> **推奨の方向性**: モジュール構成は **Option B**、OAuth の作り込み順序は **Option C のフェーズ分割**を併用するのが現実的。最終決定は design で。

---

## 5. Effort & Risk

| 項目                                  | Effort                 | Risk       | 一言根拠                                                                        |
| ------------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------- |
| MCP プロトコル層（R1, R3, R4, R5）    | **S〜M**               | Low        | SDK 導入 + 既存 `MemoService` 直呼びで大半が片付く                              |
| OAuth 2.1 認可サーバー（R2）          | **M〜L**               | **High**   | mosaku を AS 化する層が皆無。DCR/メタデータ/PKCE/同意のクライアント互換が未知数 |
| レート制限・観測性（R6, R7）          | **S**                  | Low        | 既存 throttler / Sentry を流用、enum 追加程度                                   |
| 既定保存先・title 自動生成（R3 派生） | **S**                  | Medium     | プロダクト判断（Inbox ノート新設 or 既存流用）が絡む                            |
| **総合**                              | **M〜L（1〜2週間級）** | **Medium** | メモ側 Low・OAuth High の合算。OAuth の MVP 線引きで上下する                    |

---

## 6. Research Needed（design へ持ち越し）

1. **MCP SDK 結線**: `@modelcontextprotocol/sdk`（TypeScript）の `StreamableHTTPServerTransport` を NestJS（Express アダプタ）にマウントする最適形（controller で `@Req/@Res` を渡す vs Express middleware）。セッション管理（`Mcp-Session-Id`）の要否。
2. **OAuth 2.1 の実装範囲（最重要）**:
   - 自前で最小 AS を実装するか、SDK の `mcpAuthRouter` / `OAuthServerProvider` 抽象に乗るか、外部 AS へ委譲するか。
   - **DCR（RFC 7591）の要否**: Claude Code は手動登録で回避可能か、claude.ai Custom Connector は DCR 必須か。
   - 公開すべき `.well-known`（`oauth-authorization-server` / `oauth-protected-resource`）の最小集合。
   - authorize エンドポイントで既存ソーシャルログイン/セッションをどう再利用し同意画面を出すか。
   - MCP アクセストークンを既存 mosaku JWT で代用する場合の scope（memo read/write 限定, R2.6）の表現方法。
3. **search の深さ**: v1 は Postgres `contains`（キーワード）で確定か、semantic（埋め込み）を見据えるか。返却件数上限の既定値（R4.6）。
4. **既定保存先（R3.4）**: notebook 未指定時に「MCP Inbox」ノートを自動生成するか、既存の受け皿を使うか（プロダクト判断）。`title` 必須制約への対応（content 先頭から生成 / タイムスタンプ / AI 任せ不可）。
5. **Sentry `feature_area` enum 拡張**: `mcp` を契約に追加する是非（tech.md の固定 enum 変更を伴う）。
6. **Cloud Run 制約**: Streamable HTTP のストリーミング/長時間接続と Cloud Run のリクエストタイムアウト・ステートレス前提の整合。

---

## 7. Recommendations for Design Phase

- **優先方針**: `McpModule` 新規（Option B）+ OAuth フェーズ分割（Option C）。まず本命 **Claude Code** が `claude mcp add --transport http` で繋がる最小経路を通し、claude.ai 自動接続（DCR/完全メタデータ）を続く段で固める。
- **キー決定事項**: ①OAuth AS をどこまで自前実装するか（最大の設計分岐）②MCP トークン = mosaku JWT 流用の可否 ③既定保存先と title 生成ルール ④search 上限値。
- **不変則の遵守確認**: サーバー側実装＝`apiClient` 非経由・サービス直呼び（R5.3）、所有権は `validateOwnership()` 一元化（R5.1）、React Query/Zustand 不変則には非抵触（FE 変更なし）。
- **既存無影響の担保**: MCP/well-known ルートは `@Public()` で JWT Guard を opt-out しつつ、MCP 内で独自 Bearer 検証。既存 REST 認証・throttle に副作用を出さない（R1.6）。

---

### Next Steps

- 本ギャップ分析をレビュー後、`/kiro:spec-design mcp-endpoint` で技術設計へ。
- requirements 未承認のため、設計着手前に requirements 承認（または `-y` で同時承認）を推奨。

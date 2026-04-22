# Research & Design Decisions — dogfooding-friction-log

---

## Summary

- **Feature**: `dogfooding-friction-log`
- **Discovery Scope**: Extension（既存ドメイン `memo` / `notebook` / `tag` に対する拡張）
- **Key Findings**:
  - 要件 1.2 で「摩擦専用テーブルを追加しない」と明示されており、`Memo` / `Notebook` に JSON メタデータ列を 1 本ずつ足して既存 API を拡張する方式が最も摩擦が少ない。
  - `Theme.metadata Json? @default("{}")` の前例があり、既存マイグレーションパターンをそのまま踏襲できる。
  - `frontend/src/hooks/useMemoPalette.ts` に `Cmd/Ctrl + K` 等のグローバルショートカット実装があるため、`Cmd/Ctrl + Shift + F` も同じ `window.keydown` リスナーパターンで最小差分実装できる。
  - `AdminGuard`（`backend/src/common/guards/admin.guard.ts`）が既に確立された ADMIN 限定ガードとして存在。`InvitationController` で使用例あり。ADMIN 限定ロジックはこれを活用できる。
  - Slack Webhook 連携は既存コードに皆無。新規依存（`@nestjs/axios` 等）は避け、Node.js 22+ の標準 `fetch` で実装する。

## Research Log

### 既存ドメインの DB スキーマ互換性

- **Context**: 要件 1.2 が「摩擦専用テーブル追加禁止」を規定。Memo と Notebook を拡張して摩擦ログを表現できるか確認する必要がある。
- **Sources Consulted**: `backend/prisma/schema.prisma`、`backend/src/memo/memo.service.ts`、`backend/src/notebook/notebook.service.ts`、steering の `tech.md` / `structure.md`。
- **Findings**:
  - `Memo` は `title / content / trashedAt / userId / notebookId / memoTags` 構成で、追加可能な JSON カラム枠は無い。
  - `Theme` モデルには既に `metadata Json? @default("{}")` があり、追加マイグレーション方式の前例が確立。
  - `Notebook` は `name / themeId / content / notebookTags` のみで JSON メタデータ未設定。
  - `Tag` は `name / color / userId` 構造で、領域分類（editor / theme / auth 等）を命名規約で表現可能。
- **Implications**:
  - `Memo.metadata Json?` / `Notebook.metadata Json?` の 2 カラムを追加するだけで、既存 API・DTO を「metadata を受け取れるオプション」に拡張して摩擦ログ機能を満たせる。
  - `Tag` は既存 API をそのまま使用し、領域タグは `area:editor` のような命名規約で自然に整理する。システムタグ導入は不要。
  - 追加マイグレーションは 1 本（`add_memo_notebook_metadata`）で完結。

### フロントエンドの既存ショートカット・導線パターン

- **Context**: 要件 3 が「最短 2 ステップで記録」を要求。既存の UI 導線・ショートカット機構と整合させる必要がある。
- **Sources Consulted**: `frontend/src/hooks/useMemoPalette.ts`、`frontend/src/hooks/useNavigation.ts`、`frontend/src/components/layouts/MobileLayout.tsx` / `DesktopLayout.tsx`、`frontend/src/components/memo/MemoEditor.tsx`。
- **Findings**:
  - `useMemoPalette` で `window.addEventListener('keydown')` + `metaKey/ctrlKey` 判定する実装が既に稼働中。
  - `useNavigation` が複合遷移（`goToMemoCreate` 等）を一元化しており、新規「摩擦ログ記録ビュー遷移」も同フックに追加するのが自然。
  - `RichTextEditor`（TipTap）は props で `value` / `onChange` を受け、初期コンテンツは親コンポーネントが `setContent` で制御する。テンプレート本文は `frontend/src/constants/frictionTemplate.ts` から返す文字列を `MemoEditor` の初期 state に渡せばよい。
  - `useAutoSave` は 2 秒デバウンスを既に提供しており、摩擦ログメモでもそのまま再利用可能。
- **Implications**:
  - `useFrictionShortcut` を新設するが、実装は `useMemoPalette` のコピー＋トリガー先差し替えで済む。
  - ショートカット起動時の遷移は `useNavigation.goToFrictionCapture()`（新設）で一元化する。
  - 未保存編集のある状態ではショートカットを受けた時点で `useAutoSave.flushPendingSave()` を呼ぶ必要があり、フック公開 API の拡張が必要（現状は `cancelDebounce` のみ）。

### Slack Incoming Webhook 実装方針

- **Context**: 要件 5 で `blocker` 遷移時のみ Slack 通知。要件 6.2 で `@nestjs/axios` 等新規依存追加を避ける方針。
- **Sources Consulted**: [Slack Incoming Webhooks — api.slack.com](https://api.slack.com/messaging/webhooks)、Node.js 22 `fetch` 仕様、既存 `backend/src/auth/oauth.service.ts`（HTTP クライアント利用箇所の参考）、`backend/src/instrument.ts`（Sentry 初期化）。
- **Findings**:
  - Slack Incoming Webhook は JSON POST を 1 回受けるだけの最小契約（`text` / `blocks` フィールド）。リトライ・ACK 不要。
  - Node.js 22+ は標準で `fetch` / `AbortController` を備え、追加ライブラリなしで HTTP POST 可能。
  - 重複送信防止には `Memo.metadata.slackNotifiedAt` を使い、BE 側で「24 時間以内は再送しない」を `Date.now()` 比較で判定できる。
  - Sentry は `@sentry/nestjs` が `main.ts` 最上段で初期化済み。失敗時は `Sentry.captureException` で静かに記録できる。
- **Implications**:
  - `FrictionSlackNotifier`（新規 NestJS サービス）が `fetch` で直接 POST し、失敗時は try/catch で Sentry 送信のみ行う。メモ保存トランザクションには巻き込まない。
  - `SLACK_WEBHOOK_URL` 未設定時は `notify*` がノーオペで返る guard を最初に置く（要件 5.3）。
  - 重複抑制は `MemoService.update` の直前に取得した旧 `metadata.slackNotifiedAt` と現在時刻の差分で判定し、送信成功後に `MemoService.update` が `slackNotifiedAt` を書き込む 2 段階処理とする。

### 既存 AdminGuard の適用境界

- **Context**: 要件 6.4「摩擦ログ機能は ADMIN ロールのみ」をどこで強制するか。
- **Sources Consulted**: `backend/src/common/guards/admin.guard.ts`、`backend/src/invitation/invitation.controller.ts`。
- **Findings**:
  - `AdminGuard` は `req.user.role === 'ADMIN'` を判定するだけのステートレスガード。ルート単位で `@UseGuards(JwtAuthGuard, AdminGuard)` と宣言する運用。
  - 一方、摩擦ログ用の専用エンドポイントを新設すると要件 1.2「`memo` / `notebook` ドメインの API スキーマで扱う」に抵触する。
- **Implications**:
  - 新規コントローラーは作らず、既存 `MemoController` / `NotebookController` を共用する。
  - ADMIN 限定は「サービス層での条件チェック」にする: `metadata?.kind === 'friction'` を含むリクエストは `MemoService` 内で `user.role !== 'ADMIN'` なら `ForbiddenException` を投げる。
  - FE 側では `useAuthStore` 由来の role をもとにショートカット・ボタン表示を条件付きで制御し、UX 的に USER ロールから導線を隠す。

### 将来の user-feedback 拡張余地

- **Context**: 要件 6.3「将来の一般ユーザー摩擦受付で同一スキーマ／同一 API で拡張可能」。
- **Findings**:
  - `metadata.recorderRole: 'admin' | 'user'` を最初から保持すれば、Phase 3 以降に `user` 値を受け付けるだけでスキーマ変更なく拡張可能。
  - `metadata.kind` を `'friction'` と固定文字列にし、将来 `'suggestion'` / `'bug'` 等を追加する拡張余地を残す。
- **Implications**:
  - 初版は `kind: 'friction'` のみを受容するが、zod バリデータを discriminated union にしておき、値追加が楽な構造にする。

## Architecture Pattern Evaluation

| Option                                    | Description                                                             | Strengths                                                           | Risks / Limitations                                                                          | Notes                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A. Memo metadata 拡張 + 共用 API          | `Memo.metadata` JSON に摩擦情報を格納し、既存 `/memos` API を拡張       | 新規ドメイン不要・要件 1.2 に完全準拠・1 本のマイグレーションで完結 | サービス層でロール分岐が発生し、Memo サービスの責務が肥大化する恐れ                          | **採用**。責務肥大は `FrictionMetadataGuard` 等のサービスで抽象化 |
| B. 新規 `friction-log` ドメインモジュール | `backend/src/friction-log/` と専用テーブルを追加                        | 責務分離が明確・Admin ガードをルート単位で適用可能                  | 要件 1.2 「新規ドメイン禁止」に違反・マイグレーションが重い                                  | 却下                                                              |
| C. Notebook 側 metadata のみで表現        | `Memo.metadata` を追加せず、摩擦メモは専用 Notebook 配下にあるかで判定  | Memo モデル変更が不要                                               | severity / specStatus / slackNotifiedAt を Memo に持てない → 要件 2.2 / 4.2 / 5.5 満たせない | 却下                                                              |
| D. タグだけで severity・specStatus を表現 | `severity:blocker` / `status:todo` のようなプレフィックス付きタグで識別 | DB 変更不要                                                         | MemoTag の整合性制約が効かず、同時に 2 つ severity が付く恐れ・集計が文字列比較になる        | 却下。要件 2.2 が「メタデータとして保持」と明言                   |

## Design Decisions

### Decision: Memo/Notebook への汎用 `metadata Json?` 列追加

- **Context**: 摩擦ログ特有の属性（severity、specStatus、slackNotifiedAt、recorderRole）と摩擦ログ用 Notebook フラグを、既存ドメイン内に収める必要がある。
- **Alternatives Considered**:
  1. 専用テーブルを作る（要件違反）
  2. Memo に個別カラムを多数追加（`severity_enum` / `spec_status_enum` / `slack_notified_at` …）→ 将来拡張で再マイグレーション発生
  3. 汎用 `metadata Json?` 1 本
- **Selected Approach**: Memo / Notebook の両方に `metadata Json?` を追加し、Memo 側は `FrictionMemoMetadata` 判別共用体、Notebook 側は `{ kind: 'friction-log' }` のみ保持。
- **Rationale**: 要件 6.3「将来の user-feedback 同一スキーマ拡張」を自然に満たし、将来 `kind: 'suggestion'` を足すのもスキーマ変更なしで済む。`Theme.metadata` の前例に沿っており既存パターンと一貫する。
- **Trade-offs**: JSON カラムは SQL レベルで型制約が効かないため、サービス層で zod バリデーションを強制する必要がある（型安全性は zod が担保）。
- **Follow-up**: zod スキーマ `FrictionMemoMetadataSchema` を `backend/src/common/schemas/friction-metadata.schema.ts` に配置し、DTO 変換層で `parse()` を通す。

### Decision: 専用コントローラー不新設・サービス層での ADMIN ゲート

- **Context**: ADMIN 限定を「ルート単位のガード」か「サービス層の条件」のどちらで実装するか。
- **Alternatives Considered**:
  1. `FrictionLogController` を新設して `@UseGuards(AdminGuard)`
  2. 既存 `MemoController` / `NotebookController` を再利用しサービス層で ADMIN チェック
- **Selected Approach**: 後者。`MemoService.create/update` で `metadata?.kind === 'friction'` を検知した時点で `AuthorizationService.requireAdmin(user)` を呼ぶ。
- **Rationale**: 要件 1.2 が「`memo` / `notebook` ドメインの API・DB スキーマで扱う」と明言。API スキーマの分裂を避けることで、将来の user-feedback でも同じエンドポイントで `metadata.recorderRole: 'user'` を受ける拡張が可能。
- **Trade-offs**: ガードよりも条件分岐がコード内部に入るため、テストで「通常メモ（ADMIN 外）は拒否されない」「摩擦メモ（USER）は Forbidden」の両パスをカバーする必要がある。
- **Follow-up**: `AuthorizationService` に `requireAdmin(user: JwtUser)` ヘルパーを追加し、テストでロール別パスを網羅する。

### Decision: Slack 通知を Node.js 22 標準 `fetch` + Fire-and-Forget

- **Context**: Slack Webhook 送信で新規ライブラリを避け、メモ保存の信頼性も損ねない実装が必要（要件 5.4 / 6.2）。
- **Alternatives Considered**:
  1. `@nestjs/axios` 追加 → ライブラリ追加禁止に抵触
  2. `node-fetch` 追加 → 同上
  3. Node.js 22 標準 `fetch` + try/catch + Sentry キャプチャ
- **Selected Approach**: 3。`FrictionSlackNotifier` が単一メソッド `notifyBlockerIfNeeded(memo, user)` を提供し、内部で `fetch` を実行。失敗は `Sentry.captureException` に送り、メモ保存は呼び出し元トランザクションから分離する（`notify` は `await` するが例外は伝播させない）。
- **Rationale**: Node.js 22+ は `engines` で強制済み。fetch の型は DOM ライブラリ経由で TS 型定義が通る。
- **Trade-offs**: リトライは自前で実装する必要があるが、要件 5.4 で「失敗は Sentry に記録のみ」と規定されているため初版は単発 POST で十分。
- **Follow-up**: 同一メモで 24 時間以内に重複送信しない制約を `metadata.slackNotifiedAt` で実装する。

### Decision: フロントエンドのクイックキャプチャ導線は `useNavigation` に統合

- **Context**: ショートカット・ヘッダーボタン・モバイル FAB の 3 経路から共通の「摩擦ログ新規作成画面に遷移し、テンプレート本文を注入する」アクションを呼ぶ必要がある。
- **Alternatives Considered**:
  1. 各呼び出し元が `useCreateMemo` と `useViewStore` を直接叩く
  2. `useNavigation.goToFrictionCapture()` を新設し、内部でノートブック解決＋テンプレ適用＋遷移を一元化
- **Selected Approach**: 2。
- **Rationale**: steering `structure.md` の方針「複合ナビゲーションは useNavigation 経由」に従うとコンポーネント側が複数ストアに依存しなくなる。
- **Trade-offs**: `useNavigation` が摩擦ログドメインを知ることになるが、機能フラグ `isFrictionLogEnabled` で抽象度を保てる。
- **Follow-up**: `useFrictionLogNotebook` フックで専用 Notebook の ID 解決・自動生成を担い、`useNavigation` はそれを consume するだけに留める。

### Decision: 週次トリアージは既存 memo 一覧 UI の派生ビューとして実装

- **Context**: 要件 4 で severity / 発生日時 / spec 化ステータスによる並び替え・絞り込みが必要だが、既存 memo 一覧との整合も保つ必要がある。
- **Alternatives Considered**:
  1. 新規ルーティング（例: `/friction/triage`）と独立した一覧コンポーネント
  2. 既存 `MemoList` ビューに「triage モード」prop を足す
  3. 既存 Notebook 詳細ビューに「摩擦ログ用拡張フィルタバー」を重ねて表示
- **Selected Approach**: 3。`useFrictionLogNotebook` が解決した Notebook 詳細ビューに、`FrictionTriageFilterBar` と `FrictionMetadataBadge` をオーバーレイで追加。
- **Rationale**: 要件 4.1 が「既存の memo 一覧 UI に依存してよい」と明示。既存コンポーネントを拡張するほうが実装・テストの量が最小。
- **Trade-offs**: Notebook ビューに摩擦専用ロジックが染み出すが、`isFrictionLogNotebook(notebook)` ガードで切り替えれば他 Notebook には影響しない。
- **Follow-up**: `FrictionTriageFilterBar` の表示判定を `notebook.metadata?.kind === 'friction-log'` に統一する。

## Risks & Mitigations

- **Risk 1 — JSON カラムの型ドリフト**: `metadata` に不正値が入り、後の読み出しでクラッシュする恐れ。
  - **Mitigation**: BE 書き込み経路で zod `parse()`、FE 読み出し経路でも `safeParse()` を行いフォールバック描画する（severity 欠損時は「未設定」表示）。
- **Risk 2 — Slack 通知の連打**: 深刻度を繰り返し変更すると通知が連続発火するおそれ。
  - **Mitigation**: `metadata.slackNotifiedAt` を比較し 24 時間以内の再送を抑制（要件 5.5）。ユニットテストで境界値（23h59m / 24h00m01s）をカバー。
- **Risk 3 — テンプレート改訂時の過去摩擦ログ不整合**: テンプレート定数更新により、既存摩擦ログと新規のものが混在する。
  - **Mitigation**: テンプレート適用は「新規作成時に 1 回挿入するだけ」で、既存メモは再適用しない。テンプレ版数を `metadata.templateVersion` で保持し、トリアージビューで古い版数の摩擦ログに視覚ヒントを出す（Phase 2 以降の改善余地）。
- **Risk 4 — ADMIN 以外がメタデータを直接 POST する攻撃**: `/memos` API に `metadata.kind: 'friction'` を含めるリクエストを一般 USER が送る可能性。
  - **Mitigation**: `MemoService.create/update` で `metadata?.kind` を検知した瞬間に ADMIN チェックを通す。テストで「USER が friction metadata 付きで POST → 403」を明示的に検証。
- **Risk 5 — モバイル FAB の操作干渉**: 既存モバイルレイアウトの下部ツールバーと FAB が重なる可能性。
  - **Mitigation**: `MobileLayout` の safe-area / 既存ツールバー高さを考慮し、`position: fixed; right: 16px; bottom: calc(<toolbarHeight> + 16px)` で配置。E2E テストでタップ可能性を検証。

## References

- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks) — Webhook ペイロード仕様・レート制限情報
- [Node.js 22 fetch API](https://nodejs.org/docs/latest-v22.x/api/globals.html#fetch) — 追加依存なしで使える fetch の公式ドキュメント
- [Zod Discriminated Unions](https://zod.dev/?id=discriminated-unions) — `kind: 'friction'` ベースのメタデータバリデーション設計
- [Prisma Json Fields](https://www.prisma.io/docs/orm/prisma-schema/data-model/models#json-fields) — `Json?` 列の型推論とマイグレーション挙動
- 既存実装: `backend/prisma/schema.prisma`（`Theme.metadata` の前例）、`backend/src/common/guards/admin.guard.ts`、`frontend/src/hooks/useMemoPalette.ts`、`frontend/src/hooks/useNavigation.ts`

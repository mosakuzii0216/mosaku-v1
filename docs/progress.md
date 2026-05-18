# Mosaku 進捗ログ

毎週末に更新する進捗ログ。計画書（`docs/project-plan-2026.md`）は方針・計画を、本ファイルは**実際に何が起きたか**を記録する。

- 形式: 新しいエントリは**先頭**に追記する（最新が上）
- 粒度: 週次（週末に1エントリ）
- 計画変更が発生した場合は本ファイルにメモした上で `docs/project-plan-2026.md` も更新する

---

## エントリフォーマット

```markdown
## YYYY-MM-DD（フェーズ名 / 状況サマリ）

### 今週やったこと

- 完了した spec / コミット / 意思決定を箇条書き

### 来週の予定

- 着手予定の spec / タスク

### ブロッカー・懸念

- なし、または具体的に

### メモ

- 数字（テーマ数 / テスト数 / FCP 等）や所感
```

---

## 2026-05-19（Phase 1 / 5月マイルストーンほぼ達成 + 認識ズレ訂正）

### 今週やったこと

- **`api.mosaku.jp` の UptimeRobot 間欠 Down 解消**
  - 原因は **DNS ではなく Cloud Run のコールドスタート + Domain Mapping のオーバーヘッド**（5分間隔チェックでほぼ毎回コールドスタートに当たる構造）。UptimeRobot は接続タイムアウトを "DNS Resolving problem" と表記することがある
  - `gcloud run services update mosaku-backend --region=asia-northeast1 --min-instances=1` を本番適用 → リビジョン `mosaku-backend-00049-rmj`
  - 適用後の 10 回連続 `/health` チェック: HTTP 200 が **10/10**、TTFB 平均 1.4s（最大 4.4s / 最小 0.4s）。UptimeRobot のタイムアウト（30s）に余裕で収まる範囲に
  - `docs/deployment/cloud-run.md` を更新（初回デプロイのコマンド例 `--min-instances=0` → `=1`、説明文、トラブルシューティングに UptimeRobot 誤検知の注記と Phase 1 適用済みのメモを追記）→ コミット `01268b2 docs(deployment): Cloud Run min-instances=1 への変更を反映`
  - GitHub Actions のデプロイは `--update-env-vars` / `--update-secrets` のみ指定で既存値を保持するため、毎回のデプロイで `--min-instances` が上書きされないことを確認
- **過去エントリの認識ズレを訂正**（5/14 エントリは時点の認識として残し、本エントリで補正）
  - **`SLACK_WEBHOOK_URL`**: 5/14 22:46 時点で GitHub Secrets に登録済み。`deploy-backend.yml` / `deploy-frontend-prod.yml` の `notify` ジョブ（`8398a7/action-slack@v3`）も実装済みで、最新の backend デプロイ（5/18 22:20）の `Slack Notification` ジョブが **success** → 既に通知は飛んでいる
  - **テーマ +3（計 10）**: 5/15 に `20260515000000_add_umi_tsuki_yuki_themes` マイグレーションをコミット（`dc7f703 feat(theme): umi・tsuki・yuki テーマを追加（計10テーマ）`）し、5/17 22:37 の backend デプロイで本番 DB に `migrate deploy` 済み（DB Migration ジョブ success）。CSS ファイル（`frontend/public/themes/`）も 10 個揃っている: `aka` / `ao` / `code` / `kami` / `kuro` / `mori` / `siro` / `umi` / `tsuki` / `yuki`

### 来週の予定

- **ドッグフーディング開始**（Notion を閉じる、`Friction Log` ノートブック作成、`#blocker` / `#major` / `#spec-done` タグ命名規約、金曜トリアージのルール文書化）
- 摩擦記録が貯まり次第、**摩擦 Top1 の選定 → `/kiro:spec-init`**
- 6 月以降のテーマ作成ペース見直し（9 月マイルストーン 30 テーマに向けて、月 4 テーマペース要）

### ブロッカー・懸念

- なし

### メモ

- **5 月マイルストーン: Sentry / PWA / UptimeRobot / api.mosaku.jp DNS / SLACK_WEBHOOK_URL / テーマ +3 = 6/7 達成**。残るは「ドッグフーディング開始」のみ
- Cloud Run `min-instances=1` 適用に伴う**月額コスト増は約 $13〜18**。Phase 1 ドッグフーディング期間の安定性投資として許容
- UptimeRobot の "DNS Resolving problem" 表記は実際にはタイムアウト系も含むことを `docs/deployment/cloud-run.md` の TS セクションに記録済み（将来同様の症状が出たときの参照用）
- 次のテーマ作成マイルストーン警告: 9 月 30 / 10 月 40 / 12 月 50 → 現在 10 から 6〜8 月で +20、月 4 テーマペースが必要

---

## 2026-05-14（Phase 1 準備中 / UptimeRobot 導入完了）

### 今週やったこと

- **UptimeRobot 導入完了**（mosaku.jp / api.mosaku.jp の2モニター設定、5分間隔）
  - api.mosaku.jp は DNS Resolving problem を検知中 → 並行対応中
- **NotebookEditor に変更検知とエラー表示を追加**（`fix(notebook)`）
- API 障害監視ツールの構想をドキュメント化（`docs/development/`）
- Sentry 導入 spec を `completed` に確定

### 来週の予定

- api.mosaku.jp DNS 問題の解消（対応中）
- ドッグフーディング開始（Notion を閉じる）・摩擦記録運用ルール開始
- GitHub Secrets に `SLACK_WEBHOOK_URL` を追加（デプロイ通知）
- テーマ作成（+3テーマ、計 10。5月マイルストーン達成）
- 摩擦 Top1 の選定 → `/kiro:spec-init`

### ブロッカー・懸念

- api.mosaku.jp: DNS Resolving problem を UptimeRobot が検知中（並行対応中）

### メモ

- テーマ数: 7（変わらず）
- Phase 1 5月後半タスク: Sentry ✅ / UptimeRobot ✅ / SLACK_WEBHOOK_URL ⬜ / ドッグフーディング ⬜ / テーマ +3 ⬜ / 摩擦 Top1 ⬜

---

## 2026-05-12（Phase 1 / PWA + オフライン対応完了 — 計画大幅前倒し）

### 今週やったこと

- **`pwa-offline-support` を完走**（31/31 タスク、`/kiro:validate-impl` で `implementation-validated` に確定）
  - 当初 7〜8月予定の PWA + オフライン対応を 5月で前倒し完了
  - Domain 層: `OfflineMemoRepository`（`frontend/src/utils/offline/repository.ts`）/ `SyncEngine`（`frontend/src/utils/sync/sync-engine.ts`）/ `QuotaManager` / `SyncTelemetry` / `NetworkStatusStore`
  - Hooks 層: `useNetworkStatus` / `useSyncEngine` / `useSwRegistration`、`useAutoSave` を 6 状態（`'offline-saved'` 追加）に拡張、`useMemoQueries` を Repository 経由に切替
  - UI 層: `OfflineBadge`（ヘッダー常時表示）/ `SyncToast` / `SwUpdatePrompt` / `DebugPanel`、`MemoEditor` の削除/ゴミ箱送りも Repository 経由
  - PWA 設定: `vite-plugin-pwa` を `prompt` 更新方式に切替、`/api/*` の runtimeCaching 完全排除、`themes/*.css` を precache から外して CacheFirst の遅延キャッシュ化
  - Backend: `PATCH /memos/:id` に `clientUpdatedAt`（`@IsISO8601()` + TZ 検証）を追加し、サーバー側が新しい場合は `ConflictException`（409 + 現在表現）を返す last-write-wins を実装
  - E2E: 電車内シナリオ / PWA インストール / アプリシェル / SW 更新 / パフォーマンス計測 CI ジョブ（precache 1.5x 以下・同期 30 秒以内・検索 300 ms 以内）
  - 観測性: `SyncTelemetry` 経由で `feature_area: memo` / `route` / `user_facing` タグ付き Sentry breadcrumb + リトライ上限到達時のみ `level: error`
- **テスト結果**: Frontend Vitest **519/519 緑**、Backend memo Jest **32/32 緑**、Backend e2e `memo-last-write-wins.e2e-spec.ts` 含む

### 来週の予定

- ドッグフーディング開始（Notion 閉じる）・摩擦記録運用ルール開始（`Friction Log` ノートブック作成）
- UptimeRobot 導入（Sentry とセットの未完了タスク）
- GitHub Secrets に `SLACK_WEBHOOK_URL` を追加（デプロイ通知）
- テーマ作成（+3 テーマ、計 10。5 月マイルストーン達成）
- 摩擦 Top1 の選定 → `/kiro:spec-init`

### ブロッカー・懸念

- なし

### メモ

- spec 名は計画書記載の `pwa-and-offline-cache` から `pwa-offline-support` に変わった（実装スコープを「単一デバイス前提のオフライン CRUD + シングル PWA」に明示化）
- `multi-device-conflict-resolution` は引き続き別 spec（Phase 3 / 11 月）として温存
- 当初 7〜8 月の PWA 枠が空いたため、その時間で content JSONB 移行 / 利用規約・PP 骨子 / 摩擦 Top の積み増しなどに余裕ができた
- 計画書の Phase 1 PWA 行を ✅ に更新、最終更新日を 2026-05-12 に変更

---

## 2026-05-09（Phase 1 / Sentry 統合完了）

### 今週やったこと

- **`sentry-integration` を完走**（26/26 タスク、`spec.json` を `completed` に更新）
  - Backend: SDK 初期化、PII scrubber、構造化タグ、認証 Interceptor、ConfigService 拡張
  - Frontend: SDK 初期化、`@sentry/vite-plugin` で source map upload、`useSentryRouteTag`、`AuthContext` の `setUser` 連携
  - CI: `deploy-backend.yml` / `deploy-frontend-prod.yml` に release / token / サンプリング率を注入
  - ドキュメント: `docs/deployment/sentry.md` を新規作成し single source of truth 化、`cloud-run.md` / `vercel.md` の旧セクションを誘導に整理
  - Steering: `CLAUDE.md` / `.kiro/steering/tech.md` に Sentry 環境変数を反映
  - Sentry Platform 側の Production プロジェクト・Alert Rule・Slack 通知を設定し smoke test 完了
- **タグシステムの DB マイグレーションと UI コンポーネント追加**（`feat(tag)`）
- **コード品質リファクタ多数**: `auth` / `memo` / `theme` / `tag` の ESLint 警告解消、`any` → `unknown` 置換、`auth.controller.ts` の `.bind(this)` をアロー関数化、WHAT コメントを CLAUDE.md 規約に沿って削除
- **デプロイまわりの修正**: Vercel Git Integration の自動デプロイ無効化、Cloud Run の secret 全削除リスク修正、SW source map 残留対応
- **意思決定**: オフライン対応・PWA 化の方針を会話で確定
  - 2 spec に分割: `pwa-and-offline-cache`（PWA 基盤 + オフライン CRUD、シングルデバイス前提）→ `multi-device-conflict-resolution`（競合解決）
  - 競合解決は CRDT ではなく `updatedAt` 比較 + 409 + ユーザー選択 UI で割り切り
  - キャッシュポリシーは LRU（直近 50 件 + 直近 30 日編集）

### 来週の予定

- `/kiro:spec-init` で `pwa-and-offline-cache` を起票し、要件定義フェーズに入る
- 摩擦記録の運用開始（`Friction Log` ノートブック作成）
- UptimeRobot 導入（Sentry とセットの未完了タスク）
- テーマ作成（+3、計 10）

### ブロッカー・懸念

- なし

### メモ

- 期間中コミット数: 42（前回からの差分、2.5 週分）
- spec 完了状況: 13 spec 中 7 件が `completed` または `implementation-validated`、3 件が `tasks-generated` で停滞
- `AuthContext.tsx` のオフライン起動時 `removeTokens()` 落とし穴を発見 → `pwa-and-offline-cache` の中で同梱修正予定
- JWT 有効期限は 24h ハードコード気味、リフレッシュトークン未実装。将来課題として認識

---

## 2026-04-23（Phase 1 spec 整理）

### 今週やったこと

- **`dogfooding-friction-log` を archive**（`.kiro/specs/_archived/dogfooding-friction-log/` に移動）
  - 要件・設計・タスク生成まで進めたが、永続性レビューで「Mosaku 本体に残すべき機能が無い」と判断
  - 摩擦ログは既存 `memo` + `notebook` + `tag` で運用ルール（タグ命名規約 `#blocker` / `#major` / `#spec-done` 等、`Friction Log` ノートブック手動作成、金曜トリアージ）として達成可能
  - 専用機能（Slack 通知 / トリアージ UI / クイックキャプチャショートカット / ADMIN ゲート）はドッグフーディング期間限定でユーザー公開後にテックデブト化するため不採用
  - 汎用価値がありそうな「ノートブック単位のテンプレート」機能は、必要になった時点で別 spec として再起票

### 来週の予定

- `sentry-integration`・`uptime-monitoring` の spec-init / requirements に着手
- ドッグフーディング運用ルールを `.kiro/steering/` または `CLAUDE.md` に短く追記するか検討

### ブロッカー・懸念

- なし

### メモ

- 「あとで削除するのが面倒」を判断軸にすると、Phase 1 ドッグフーディング期間中の自分専用機能は基本的に作らない方が筋が良いと再確認

---

## 2026-04-20（Phase 0完了 → Phase 1移行間）

### 今週やったこと

- **`mosaku-brand-theme` 実装完了 → `implementation-validated` で確定**（28/28 タスク完了、2026-04-21 検証）
  - `mori` テーマを深緑の森ブランドテーマに全面リライト
  - テーマエフェクト基盤を新設（`ThemeEffectKey` 契約 / `themeEffectRegistry` / `ThemeEffectHost` / `useEditorFocusStore` / `useMoriEffectControl` / `useActiveTheme`）
  - エフェクトコンポーネントを `frontend/src/components/effects/` に集約（共通: `ForestAnimationLayer` / `ParticleCanvas`、mori専用: `mori/MoriEffectLayer`）
  - mori テーマレコードに `effectKey: 'mori'` メタデータを追加するマイグレーションを backend に投入
  - バンドル分離・ライフサイクル・a11y 検証テストを追加
  - `/kiro:validate-impl` 結果: Vitest 256/256 緑、`MoriEffectLayer-*.js` が独立チャンク化、要件 1〜7 全トレース可能 → GO
- **`auth-register-invitation-refactor`** が `implementation-validated` で完了
- **CLAUDE.md 更新**（コミット `70431de`）
- **CI 改善**: Backend デプロイ認証を Workload Identity Federation に移行 / Artifact Registry 移行 / Slack 通知の安全化

### 来週の予定

- `/kiro:steering` で steering ファイルを再同期（今回手動で更新したが、コード進化に追従するため）
- Phase 1 の spec 3 本を `spec-init`：
  - `dogfooding-friction-log`（ドッグフーディング摩擦記録の運用と仕組み）
  - `sentry-integration`（バックエンド + フロントエンド）
  - `uptime-monitoring`（UptimeRobot 連携 + `/health` エンドポイント整備）
- 新規テーマ作成の素案（+3、計10テーマに向けて）

### ブロッカー・懸念

- なし

### メモ

- Phase 0 のリリース要件（コアリファクタ + 自動保存 + ゴミ箱 + Staging）は完了済み
- 計画外ボーナスとして 3 spec（`login-visual-redesign` / `oauth-providers-expansion` / `mosaku-brand-theme`）を実装。ブランド表現と認証選択肢が大きく強化された
- 開発プロセス: cc-sdd（仕様駆動開発）が定着。1 Todo = 1 Commit ルールも維持

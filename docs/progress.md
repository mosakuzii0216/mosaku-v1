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

## 2026-06-02（Phase 1 ドッグフーディング中 / spec phase を全整合 + 6月テーマ +5 を前倒し達成）

### 今週やったこと（5/31 エントリ以降）

- **前週末の宿題「実装完了済み spec の phase 整合」を完了**
  - `refresh-token-auto-login` / `memo-public-sharing` / `memo-public-isolation` の 3 spec を `implementation-validated` に締めた（5/31 時点のブロッカーだった phase ズレを解消）
  - 本日さらに `viral-invitation` を `/kiro:validate-impl` で検証 → GO（Backend 152/152・Frontend 50/50 緑、旧 `register-with-invitation` 5 本と文字列マッチ判定の残存ゼロを確認）→ `implemented` から `implementation-validated` へ
  - **これで全 18 spec が `completed` / `implementation-validated` に到達**（phase 未整合ゼロ）
- **6月マイルストーンのテーマ作成（+5、計15）を前倒し達成**（`sakura` / `yuyake` / `sumi` / `neon` / `wakaba`）
- **DB プール監視の運用補強**（`memo-public-isolation` 由来）
  - DB プール使用率の定期観測サービスを追加、`DB_POOL_MAX_CONNECTIONS` を `.env.example` に追記、運用 runbook の gcloud/MQL 断片を実機検証で修正

### 来週の予定

- 7月テーマ作成（+5、計20）に着手 — 6月分を前倒し済みのためペースに余裕
- モバイル操作感の実機確認・改善
- エディタ E2E テスト追加（Playwright、TipTap v3 安定性の自動検知）
- 次の摩擦 Top2〜3 の選定 → `/kiro:spec-init`（候補: ピン留め / Markdown エクスポート / 全文検索 / キーボードショートカット）

### ブロッカー・懸念

- なし（spec phase ズレは全解消）
- main がローカル先行（push 未実施分の有無を要確認）

### メモ

- 完了 spec 状況: **18 spec すべてが `completed`（8）/ `implementation-validated`（10）**。実装完了率 100%、phase 整合済み
- テーマ数: **15**（6月マイルストーン達成）。9月マイルストーン（23）に向け 7〜8月で +8 ペース
- 5/31 の高密度 2 週間の後、今週は「締め」週。実装より phase 整合・運用補強・テーマ量産にウェイト

---

## 2026-05-31（Phase 1 ドッグフーディング中 / 摩擦駆動 spec を量産 — 認証・招待・公開共有が前進）

### 今週やったこと（5/20〜5/31 の2週間ぶん）

- **`refresh-token-auto-login` を実装完走**（5/21〜23）
  - Backend: cookie-parser 導入 + Refresh Cookie ヘルパ、Refresh Token 用 CSRF Guard、Refresh Token のリポジトリ／サービス層、`/auth/refresh` `/logout` 新設、`JwtAuthGuard` をグローバル化し `@Public()` opt-out に統一、`refresh_token_issue_failed` イベント + tokenHash scrubber
  - Frontend: `AuthContext` を Refresh Token 復元優先に再構築、API Client の 401 経路で透過リフレッシュ発火、Refresh Client モジュール新設
  - E2E: バックエンドの Refresh フロー、フロントの「ブラウザ再起動相当の自動復元」Playwright。`docs/deployment/cloud-run.md` にリリース後検証チェックリスト追加
  - ※ `spec.json` の phase は `tasks-approved` のままだが tasks.md は完了マーク済み（実態は実装完了）
- **`viral-invitation` を実装**（5/24〜26、phase=`implemented`）
  - Backend: `InvitationStateService` を HMAC-SHA256 で実装、OAuth 開始 API 新設 + コールバックに state 検証分岐、`QuotaPolicy` をロール別評価 + 楽観ロック減算、`CodeGenerator`（nanoid no-look-alike）、`InvitationController/Service` を verify-context / 自分用 CRUD / shareUrl 付与に拡張、`User.invitationQuota` カラム追加、`INVITATION_STATE_SECRET` を `JWT_SECRET` と分離
  - Frontend: `/invite/:code` ページ、`AuthForm` を新フロー（prefill / OAuth start / 自動ログイン）に整合、`useInvitationsQueries`、`shareInvitation`（Web Share + clipboard フォールバック）、`ApiError` 導入、設定ページに招待管理セクション
- **`memo-public-sharing`（メモ公開共有）を実装**（5/28〜30、tasks 35/35 完了）
  - Backend: `memos` に公開トークン・公開日時カラム追加、`MemoSharingService`、公開/解除/再生成/閲覧 API（リバースプロキシ対応）、ゴミ箱遷移時の公開自動解除カスケード
  - Frontend: 公開系データアクセス層、未ログイン閲覧者向け公開ビュー、エディタヘッダーの公開コントロール、設定ページの公開メモ管理カード、E2E シナリオ
  - ※ phase は `implementing` のままだが tasks 全完了（実態は実装完了）
- **`memo-public-isolation`（公開メモ隔離）を新規起票 → 実装まで完走**（5/30〜31）
  - 公開読み取り／編集経路の対称な観測 Interceptor、メトリクスの公開／編集分離、一方向 DI 継ぎ目のフィットネステスト、データ境界回帰テスト、公開メモトークンの Sentry 流出防止、運用 runbook（ログメトリクス / アラート / 段階的分離 Playbook）、不変則テスト（bk+fe）
  - 差分を 6 コミットにタスク単位で整理し main に fast-forward 済み（backend 65 / frontend 13 テスト緑）
- **ドッグフーディング運用ルールを steering に正式追加**（`.kiro/steering/dogfooding.md`、5/22）。5/19 時点の未着手タスクを解消
- **メモ一覧の UX 改善**（5/21〜22）: 検索バー / ソート切替 / タイトル・件数表示 / 新規作成ボタン / 空状態の作成 CTA
- **自動保存のデバウンスを 1000ms → 200ms に短縮**（5/25、体感改善）
- **オンライン編集も IndexedDB キュー経由に統一**（5/26、`MemoBridge`/`SyncEngine` の pending 通知配線）
- **CLAUDE.md 更新**（5/22）: アーキ不変則・dogfooding・コミット規約を追記し環境変数を圧縮
- **OAuth Strategy 未設定時の起動継続**を Google / GitHub にも適用（警告降格）
- **lint クリーンアップ多数**（`no-unsafe-*` 警告を auth/test・sentry・backend test で計数十件解消）

### 来週の予定

- 実装完了済み spec の phase 整合（`refresh-token-auto-login` / `memo-public-sharing` / `memo-public-isolation` を `/kiro:validate-impl` で `implementation-validated` へ）
- 6月テーマ作成（+5、計15）に着手
- モバイル実機確認・エディタ E2E（TipTap v3 安定性検知）
- 次の摩擦 Top の選定 → `/kiro:spec-init`

### ブロッカー・懸念

- **spec.json の phase と実装実態のズレ**が複数（`refresh-token-auto-login`=tasks-approved / `memo-public-sharing`=implementing / `memo-public-isolation`=tasks-generated だが、いずれも実装・テスト完了）。validate-impl で締めて整合させたい
- main がローカル先行（push 未実施の分あり）

### メモ

- 期間中コミット数: 約100（5/19〜5/31、2週間ぶん）。大型 spec 4本が並行で進んだ密度の高い2週間
- 完了 spec 状況: 18 spec 中、completed / implementation-validated が 14、implemented が 1（`viral-invitation`）、実装完了だが phase 未整合が 3（`refresh-token-auto-login` / `memo-public-sharing` / `memo-public-isolation`）
- テーマ数: 10（変わらず）。9月マイルストーン（23テーマ）に向け 6〜8月で +13 ペースが必要
- `refresh-token` / `viral-invitation` / メモ一覧 UX / 自動保存高速化は、いずれもドッグフーディングで露出した摩擦の解消にあたる

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

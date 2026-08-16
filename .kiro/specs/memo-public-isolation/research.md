# Research & Design Decisions — memo-public-isolation

---

**Purpose**: design.md を支える discovery 結果・調査ログ・意思決定の根拠を記録する。design.md は自己完結を保ち、本ファイルは背景の参照元とする。

---

## Summary

- **Feature**: `memo-public-isolation`
- **Discovery Scope**: Extension（既存 NestJS / Sentry / Cloud Run / Supabase スタック内で完結。新規外部依存なし）
- **Key Findings**:
  - **G1（route 正規化・トークン流出防止）は既に実装済み**。`sentry-tags.ts` に `normalizeRoute` / `sanitizeRequestUrl` / `PUBLIC_MEMO_NORMALIZED_PATH` が入り、`instrument.ts` の `beforeSend` で `sanitizeRequestUrl → applyStandardTags` が適用される。→ Req 1.1/1.2/1.5/6.3 はコード上達成、設計では契約として固定する。
  - **G3（一方向 DI の自動検証）も実装済み**。`memo-sharing.dependency.spec.ts` がソース文字列レベルで `./memo.service` import を禁止するフィットネステスト。→ Req 3.2-3.4 達成、設計では恒久化対象。
  - **本フェーズの新規コード成果物は実質「公開読み取りの構造化ログ発出（薄い Interceptor 1 枚）」のみ**。残りはトリガー閾値・アラート・段階的分離 Playbook の文書化（`docs/deployment/`）。
  - **G2 メトリクス真実源 = Cloud Logging ログベースメトリクス**（2026-05-30 ユーザー合意・確定）。Sentry / OTel は不採用。

## Research Log

### 公開読み取り経路の現状資産（既存コード精査）

- **Context**: 何が既に達成され、何が残るかを確定し、Non-Goal を踏み越えないため。
- **Sources Consulted**:
  - `backend/src/memo/public-memo.controller.ts` — `@Public()` + `@Throttle(60/分)` + `Cache-Control: private, max-age=30, must-revalidate` + `Vary: Accept`。
  - `backend/src/memo/memo-sharing.service.ts:147` `findByToken` — `where: { publicToken, trashedAt: null }` / `select: { title, content, updatedAt }`。`prisma` のみ参照、`MemoService` 非依存。
  - `backend/src/memo/memo.module.ts` — `MemoController` と `PublicMemoController` が同一 NestJS アプリ=同一 Cloud Run に同居。
  - `backend/src/common/sentry/sentry-tags.ts` — `normalizeRoute` / `sanitizeRequestUrl` / 5 タグ契約 / `resolveFeatureArea('/memos/...')→'memo'`。
  - `backend/src/instrument.ts` — `beforeSend` で `sanitizeRequestUrl(scrub(event))` → `applyStandardTags`。`sampleRate:1.0`（エラー全件）/ `tracesSampleRate` 本番 0.1（env 駆動）。
  - `backend/src/common/logger/app-logger.service.ts` — 現状 `console.log('[ctx] message')` のテキスト形式。**構造化 JSON ではない**ため、ログベースメトリクスのラベル抽出には専用の JSON 発出が要る。
  - `backend/src/memo/memo-sharing.dependency.spec.ts` — 逆流 import 禁止のフィットネステスト。
- **Findings**:
  - 公開経路の機能・データ境界・疎結合・トークン正規化は**コード上すでに健全**。
  - 唯一の構造的欠落は「ルート別に集計できる構造化メトリクスの発出源」。`AppLogger` のテキストログでは Cloud Logging が `jsonPayload.route` 等のラベルを抽出できない。
- **Implications**:
  - 設計は「新規大規模実装」ではなく「観測の発出源 1 枚 + 文書 + 既存達成事項の契約固定」。
  - 公開読み取り専用の構造化ログ発出を、既存 `AppLogger` とは別経路（`console.log(JSON.stringify(...))`）で行い、Cloud Run の自動 jsonPayload パースに乗せる。

### Cloud Run / Supabase の母数（トリガー閾値導出根拠）

- **Context**: Req 2.1 の数値トリガーを主観でなく構成値から導く。
- **Sources Consulted**: `docs/deployment/cloud-run.md`（`--concurrency=100`, `--max-instances=10`, `--cpu=1 --memory=512Mi`）/ Supabase pooler（6543, transaction mode）。
- **Findings**:
  - 理論最大同時処理 = `concurrency 100 × max-instances 10 = 1000 req` 同時。
  - DB は pooler 経由でルート別に割れない → 公開 req スパイクと pooler 全体使用率の**相関**で代替閾値を設計。
  - Cloud Run のインスタンス数・CPU 使用率は**ネイティブメトリクス**（コード不要）で取得可能。
- **Implications**: トリガーは (a) 公開 req レート（ログベースメトリクス）, (b) 編集 p95 劣化（ログベースメトリクス）, (c) インスタンス使用率（Cloud Run ネイティブ）, (d) DB プール使用率（Supabase ネイティブ × 相関）の 4 系統で構成する。

## Architecture Pattern Evaluation

| Option                         | Description                                                                                               | Strengths                                                                     | Risks / Limitations                                                                                       | Notes                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A. 既存最小拡張（Extend）      | route 正規化（済）+ DI テスト（済）+ 文書、メトリクスは Cloud Run 標準ログ regex                          | 新規コードゼロ                                                                | `httpRequest.requestUrl` にトークンが残り Cloud Logging retention に秘密値、ルート別の clean-label が困難 | 採用しない（Req 6.3 と緊張）      |
| B. 観測フルモジュール化（New） | `PublicMemoObservabilityModule` + Interceptor + ログメトリクス + （将来）OTel                             | 責務分離が将来移設に最適                                                      | 実装量増・「いま作り込まない」方針と緊張                                                                  | 過剰                              |
| **C. ハイブリッド（採用）**    | 薄い NestJS Interceptor 1 枚で正規化ルート付き構造化 JSON ログを発出 → Cloud Logging ログベースメトリクス | clean-label を能動的に担保・将来サービス分割時に Interceptor ごと移設可・軽量 | Interceptor 配線とメトリクス定義の手順化が要る                                                            | **採用**。gap-analysis 推奨と一致 |

## Design Decisions

### Decision: メトリクス真実源 = Cloud Logging ログベースメトリクス（薄い Interceptor 発出）

- **Context**: Req 1.3「公開読み取りを編集系から独立して Cloud Monitoring に集計」。Cloud Run 標準メトリクスはサービス/リビジョン単位でルート別に割れない。
- **Alternatives Considered**:
  1. Cloud Run 標準リクエストログを regex フィルタ — コード 0 だが `requestUrl` にトークンが残留（retention 懸念）、clean-label 困難。
  2. Sentry トランザクション/パフォーマンスを真実源 — 本番 trace 0.1 サンプリングで rate が不正確・quota 圧迫。
  3. OpenTelemetry カスタムメトリクス — 配線重く「いま作り込まない」方針と不整合。
  4. **薄い Interceptor が正規化ルート付き構造化 JSON ログを stdout 発出 → Cloud Logging ログベースメトリクス**。
- **Selected Approach**: (4)。`PublicMemoController` にスコープした Interceptor が、リクエスト完了時に `{ message:"public_memo_read", route:"/memos/public/:token", method, status, latency_ms, severity }` を 1 行 JSON で発出。Cloud Logging が jsonPayload としてパースし、counter（req 数）/ distribution（レイテンシ）/ filter `status>=500`（エラー率）の 3 メトリクスを定義。
- **Rationale**: 全件カウントの正確性（サンプリング非依存）、秘密トークン非保存（route は `:token` 正規化済み）、Cloud Monitoring アラート（Req 2.2）との直結、将来のサービス分割時に Interceptor ごと公開サービスへ移設可能。
- **Trade-offs**: ✅ 軽量・clean-label・移設容易 / ❌ ログベースメトリクスとアラートポリシーの定義が手順書（gcloud 断片）に残り、本フェーズでは IaC 化しない。
- **Follow-up**: Interceptor の発出 JSON が `AppLogger` のテキストログと混在しても Cloud Logging で区別できるよう `message`/`logName` キーを固定。`route` は `normalizeRoute` を単一ソースとして共有。

### Decision: route 正規化ロジックの単一ソース化（既存 `sentry-tags.ts` を共有）

- **Context**: Sentry タグ（既存）と新規ログメトリクスの双方が `/memos/public/:token` 正規化を必要とする。二重定義は drift リスク。
- **Selected Approach**: `sentry-tags.ts` の `normalizeRoute` / `PUBLIC_MEMO_NORMALIZED_PATH` を公開ユーティリティとして Interceptor からも import し再利用。
- **Rationale**: 正規化規則が 1 箇所。トークン流出防止の不変条件を 1 関数で保証。
- **Trade-offs**: ✅ DRY・一貫性 / ❌ `sentry-tags.ts` の責務がわずかに「共通ルート正規化」へ拡張（許容範囲）。
- **Follow-up**: Req 3.3「共通部分は双方が依存可能な下位レイヤーに配置」に合致（`common/sentry` は編集系サービス非経由の下位）。

### Decision: トリガー & Playbook はコードでなく `docs/deployment/` の文書成果物

- **Context**: Req 2/5 は「明文化」を要求し、物理分割の実装は Non-Goal。
- **Selected Approach**: `docs/deployment/memo-public-isolation-runbook.md` を新規作成。(1) 数値トリガー表（閾値・継続時間・観測源）、(2) トリガー→分離段階の対応表、(3) 3 段階 Playbook（前提・順序・ロールバック）、(4) Cloud Monitoring アラートの gcloud 設定断片。
- **Rationale**: Non-Goal 維持・トリガー駆動原則・障害時に即興しないための準備。
- **Trade-offs**: ✅ 軽量・方針忠実 / ❌ アラートポリシーが手動/手順書に残り IaC 化は後続フェーズ。
- **Follow-up**: 閾値の初期値は構成母数から導出した「提案値」とし、ドッグフーディング運用で調整する旨を明記。

### Decision: 公開トークン入力検証の二重防御を契約として固定

- **Context**: Req 4。`GetPublicMemoParamsDto` が `@Length(20,64)` + `@Matches(/^[A-Za-z0-9_-]+$/)`、`findByToken` が `trashedAt:null` で境界を作る。
- **Selected Approach**: 既存挙動を回帰テストで固定（未公開・ゴミ箱・トークン無効・編集系フィールド非露出）。新規ロジックは追加しない。
- **Rationale**: 既に健全。設計は「壊さないことの検証」に徹する。

## Risks & Mitigations

- **R1: ログベースメトリクスのラベル汚染** — Interceptor が万一生トークンを `route` に入れると秘密流出。→ `normalizeRoute` を唯一の経路にし、ユニットテストで `:token` 化を固定。
- **R2: 閾値の妥当性** — 初期トリガー閾値が実トラフィックと乖離。→ 「提案値・運用調整前提」と明記し、Cloud Monitoring の実測でチューニング。
- **R3: Stage 1（CDN 化）の鮮度** — `public, s-maxage` 化で公開解除/更新が即時反映されない。→ Playbook に s-maxage 上限とキャッシュ無効化（unpublish/update 時）要件を明記。Non-Goal の実装は後続。
- **R4: AppLogger テキストログとの混在** — Cloud Logging パース不能。→ 公開メトリクス用ログは独立 JSON 行 + 固定 `message` キーで発出し、メトリクスフィルタを `message` で限定。

## References

- `docs/deployment/cloud-run.md` — Cloud Run 構成（concurrency/max-instances/cpu/memory）。トリガー母数。
- `docs/deployment/sentry.md` §3 — 現状の唯一のアラート経路（Sentry Issue → Slack）。
- [Cloud Logging log-based metrics](https://cloud.google.com/logging/docs/logs-based-metrics) — counter / distribution メトリクス定義。
- [Cloud Monitoring alerting policies](https://cloud.google.com/monitoring/alerts) — 閾値アラート。
- `.kiro/specs/memo-public-isolation/gap-analysis.md` — ギャップ判定の一次資料。

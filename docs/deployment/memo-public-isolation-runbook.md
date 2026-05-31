# memo-public-isolation 運用 Runbook

> **目的**: 公開メモ閲覧トラフィック（`GET /memos/public/:token`）と編集トラフィックの隔離（bulkhead）に向けて、
> **「いつ・どう分離に着手するか」を数値で判断・発動できる**ようにする運用文書。本フェーズは物理分割を行わず
> （Non-Goal: Req 5.5）、(1) ログベースメトリクス定義、(2) アラートポリシー、(3) 数値トリガー表と段階対応、
> (4) 段階的分離 Playbook を確定する。
>
> **関連**: 仕様 `.kiro/specs/memo-public-isolation/`（`requirements.md` / `design.md`）、
> [`cloud-run.md`](./cloud-run.md)（デプロイ母数）、[`sentry.md`](./sentry.md)（Slack `#mosaku-alerts` 通知経路）。
>
> **観測の発出源（実装済み・契約として固定）**:
>
> | 経路         | Interceptor（コントローラスコープ）                                                                 | 固定キー（`jsonPayload.message`） | 用途                                                   |
> | ------------ | --------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
> | 公開読み取り | `PublicReadObservabilityInterceptor`（`backend/src/memo/public-read-observability.interceptor.ts`） | `public_memo_read`                | 公開 req 数・レイテンシ・エラー率                      |
> | 編集         | `MemoEditObservabilityInterceptor`（`backend/src/memo/memo-edit-observability.interceptor.ts`）     | `memo_edit_read`                  | 編集経路 route 別 p95 レイテンシ（Req 2.4 一次データ） |
>
> いずれも 1 リクエスト 1 行 JSON を stdout へ発出し、Cloud Run が `jsonPayload` として自動パースする。
> `route` は必ず `normalizeRoute` 済み（公開は `/memos/public/:token`、編集は `/memos/:id` 等）で、
> **生トークン・生 id を含まない**（Req 1.1 / 6.3）。

---

## 0. 前提母数（トリガー閾値の算定根拠）

| 項目                                  | 値                                                                                           | 出典                                                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Run 同時実行（`--concurrency`） | **100**（設計母数）                                                                          | design.md。⚠️ 現行 `gcloud run deploy`（[`cloud-run.md`](./cloud-run.md) §デプロイ）は `--concurrency` 未指定でデフォルト 80。**トリガー運用前に `--concurrency=100` を明示して母数を一致させること** |
| 最大インスタンス（`--max-instances`） | 10                                                                                           | [`cloud-run.md`](./cloud-run.md)                                                                                                                                                                      |
| 最小インスタンス（`--min-instances`） | 1                                                                                            | [`cloud-run.md`](./cloud-run.md)                                                                                                                                                                      |
| 理論同時処理上限                      | `100 × 10 = 1000 同時`                                                                       | 母数 = concurrency × max-instances                                                                                                                                                                    |
| DB 接続                               | Supabase pooler（6543）                                                                      | プール使用率を Stage 3 トリガーに使用                                                                                                                                                                 |
| 既存緩和策                            | IP 60 req/分レート制限（`@Throttle`）+ `Cache-Control: private, max-age=30, must-revalidate` | requirements.md                                                                                                                                                                                       |
| 通知先                                | Slack `#mosaku-alerts`（Cloud Monitoring 通知チャネル → 既存 Sentry 通知経路に合流）         | [`sentry.md`](./sentry.md) §3                                                                                                                                                                         |

> **gcloud 共通**: 以下の断片は `PROJECT_ID="mosaku-prod-xxxxx"` / `REGION="asia-northeast1"` /
> `SERVICE_NAME="mosaku-backend"` を前提とする。閾値はすべて**初期提案値**であり、本番実測でチューニングする
> （research.md R2）。

---

## 1. ログベースメトリクス定義（gcloud 断片）— Req 1.3 / 2.1

公開読み取りと編集経路の構造化ログから、ルート別にメトリクスを集計する。Cloud Run ネイティブの p95 は
公開＋編集が混在し公開スパイク時に汚染されるため、**両経路とも専用 Interceptor の固定キーを一次データ源**とする。

### 1.1 公開読み取り count（`status_class` ラベル付き）— served カウント

`status` の先頭桁（2/4/5）を `status_class` ラベルへ抽出し、2xx/4xx/5xx を分離集計する。

```yaml
# public_memo_read_count.yaml
name: public_memo_read_count
description: '公開メモ読み取り（Interceptor 到達分=served）の req 数。status_class で 2xx/4xx/5xx を分離'
filter: 'resource.type="cloud_run_revision" AND jsonPayload.message="public_memo_read"'
metricDescriptor:
  metricKind: DELTA
  valueType: INT64
  unit: '1'
  labels:
    - key: status_class
      valueType: STRING
      description: 'HTTP status の先頭桁（2=2xx / 4=4xx / 5=5xx）'
labelExtractors:
  status_class: 'REGEXP_EXTRACT(jsonPayload.status, "^(\\d)")'
```

```bash
gcloud logging metrics create public_memo_read_count \
  --project="${PROJECT_ID}" \
  --config-from-file=public_memo_read_count.yaml
```

> エラー率は `public_memo_read_count{status_class="5"}` ÷ 全 status_class 合計で導出する（5xx 比率）。

### 1.2 公開読み取り latency 分布（p50/p95/p99 算出源）

```yaml
# public_memo_read_latency.yaml
name: public_memo_read_latency
description: '公開メモ読み取りのレイテンシ分布（ms）。p50/p95/p99 を Cloud Monitoring で算出'
filter: 'resource.type="cloud_run_revision" AND jsonPayload.message="public_memo_read"'
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: 'ms'
valueExtractor: 'EXTRACT(jsonPayload.latency_ms)'
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: 64
    growthFactor: 1.4
    scale: 1.0
```

```bash
gcloud logging metrics create public_memo_read_latency \
  --project="${PROJECT_ID}" \
  --config-from-file=public_memo_read_latency.yaml
```

### 1.3 公開読み取り 429 throttled 補完メトリクス

**重要（観測スコープの限界）**: NestJS の実行順は **Guard → Interceptor** であり、`ThrottlerGuard`（IP 60 req/分）が
弾く **429 は `PublicReadObservabilityInterceptor` に到達しない**。よって 429 は Cloud Run ネイティブのリクエスト
ログ（`httpRequest.status=429`）から別メトリクスで補完計上する。フィルタは公開パスのプレフィックスで限定し、
**生トークンは `httpRequest.requestUrl` に含まれるがメトリクスのラベルとしては抽出しない**（ラベル流出なし）。

```bash
gcloud logging metrics create public_memo_read_throttled_count \
  --project="${PROJECT_ID}" \
  --description="公開メモ読み取りの 429（レート制限弾き）数。Interceptor 非到達分を Cloud Run ネイティブログから補完" \
  --log-filter='resource.type="cloud_run_revision" AND httpRequest.status=429 AND httpRequest.requestUrl:"/memos/public/"'
```

### 1.4 公開 req レートの導出（served + throttled の和）

> **契約（Req 2.1）**: 公開 req レート＝ `public_memo_read_count`（served・到達分）
> ＋ `public_memo_read_throttled_count`（throttled・429 弾き分）**の和**。
> 429 は Interceptor の `public_memo_read_count` には現れないため、和を取らないと「到達試行レート」を過小評価する。
> 和の算出は §2.1 のアラート MQL 内で行う。

### 1.5 編集経路の route 別レイテンシメトリクス（Req 2.4 の一次データ源）

公開側と**対称**な `memo_edit_read` 固定キーから、編集 p95 を公開トラフィックの汚染なしに切り出す。

```yaml
# memo_edit_latency.yaml
name: memo_edit_latency
description: '編集経路（MemoController）の route 別レイテンシ分布（ms）。Req 2.4 編集 p95 劣化アラートの一次データ'
filter: 'resource.type="cloud_run_revision" AND jsonPayload.message="memo_edit_read"'
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: 'ms'
  labels:
    - key: route
      valueType: STRING
      description: 'normalizeRoute 済みの編集ルート（例 /memos, /memos/:id）。生 id は含まない'
valueExtractor: 'EXTRACT(jsonPayload.latency_ms)'
labelExtractors:
  route: 'EXTRACT(jsonPayload.route)'
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: 64
    growthFactor: 1.4
    scale: 1.0
```

```bash
gcloud logging metrics create memo_edit_latency \
  --project="${PROJECT_ID}" \
  --config-from-file=memo_edit_latency.yaml
```

---

## 2. アラートポリシー（gcloud 断片）— Req 2.2 / 2.4

各アラートは**継続時間条件付き**（`for N min`）で瞬間スパイクのノイズを抑制し、Slack `#mosaku-alerts` 通知
チャネルへ送る。通知チャネルは事前に作成し、`CHANNEL_ID` を取得しておく。

```bash
# 通知チャネル ID の確認（Slack #mosaku-alerts を事前作成済みの前提）
gcloud beta monitoring channels list --project="${PROJECT_ID}" \
  --filter='displayName="mosaku-alerts"' --format='value(name)'
# 例: projects/mosaku-prod-xxxxx/notificationChannels/123456789  → 以降 CHANNEL_ID とする
```

### 2.1 公開 req レート閾値超過（served + throttled の和）

MQL で 2 メトリクスを合算してレート評価する。閾値・継続時間は §3 のトリガー表に対応。

```yaml
# alert_public_req_rate.yaml
displayName: '[memo-isolation] 公開 req レート超過 (served+throttled > 50 req/s for 5m)'
combiner: OR
conditions:
  - displayName: '公開 req レート (served+throttled)'
    conditionMonitoringQueryLanguage:
      query: |
        { fetch cloud_run_revision
          | metric 'logging.googleapis.com/user/public_memo_read_count'
          | align rate(1m)
          | group_by [], [v: sum(value.value)]
        ; fetch cloud_run_revision
          | metric 'logging.googleapis.com/user/public_memo_read_throttled_count'
          | align rate(1m)
          | group_by [], [v: sum(value.value)] }
        | union
        | group_by [], [total: sum(v)]
        | condition val() > 50 '1/s'
      duration: 300s
notificationChannels:
  - 'CHANNEL_ID'
```

> **MQL の実装上の注意（2026-06-01 実機検証で確定）**:
>
> - クエリは `fetch <resource>`（ここでは `cloud_run_revision`）で開始する。`metric '...'` 単体で始めると `Table operator 'metric' requires resource input` で弾かれる。
> - `union` は**入力テーブルの列名・列型の一致**を要求する。`public_memo_read_count` は `status_class` ラベルを持つため、`union` 前に各ブランチを `group_by [], [v: sum(value.value)]` でラベル無し・**同名の値列 `v`** に畳んでから結合する。
>
> ```bash
> gcloud alpha monitoring policies create \
>   --project="${PROJECT_ID}" \
>   --policy-from-file=alert_public_req_rate.yaml
> ```

### 2.2 編集 p95 レイテンシ劣化（公開 req 上昇との相関 →「編集体験への影響あり」Req 2.4）

編集 p95 の劣化を主条件とし、`combiner: AND` で公開 req 上昇と相関したときのみ
**「編集体験への影響あり」**として発火させる（公開スパイクが編集を巻き込んだ兆候を識別可能にする）。

> **GCP 制約（2026-06-01 実機検証で確定）**: `monitoring_query_language` 条件を持つアラートポリシーは
> **条件を1個しか持てない**（`combiner: AND` で MQL 2条件を並べると `can only have a single condition` で弾かれる）。
> そのため「編集 p95 劣化 AND 公開 req 上昇」は**単一 MQL 内で `join` ＋ `&&`** に畳んで表現する。`join` は
> 両入力テーブルを `group_by []`（ラベル無し単一系列）に畳んでおくと 1 行に結合でき、`val(0)`＝編集 p95、
> `val(1)`＝公開 req レートとして相関条件を書ける。

```yaml
# alert_edit_p95_impacted.yaml
displayName: '[memo-isolation] 編集体験への影響あり (edit p95 > 800ms AND 公開 req 上昇 for 5m)'
combiner: OR
conditions:
  - displayName: '編集 p95 劣化 AND 公開 req 上昇'
    conditionMonitoringQueryLanguage:
      query: |
        { fetch cloud_run_revision
          | metric 'logging.googleapis.com/user/memo_edit_latency'
          | align delta(1m)
          | every 1m
          | group_by [], [p95: percentile(value.value, 95)]
        ; { fetch cloud_run_revision
            | metric 'logging.googleapis.com/user/public_memo_read_count'
            | align rate(1m)
            | group_by [], [v: sum(value.value)]
          ; fetch cloud_run_revision
            | metric 'logging.googleapis.com/user/public_memo_read_throttled_count'
            | align rate(1m)
            | group_by [], [v: sum(value.value)] }
          | union
          | every 1m
          | group_by [], [rate: sum(v)] }
        | join
        | condition val(0) > 800 'ms' && val(1) > 30 '1/s'
      duration: 300s
notificationChannels:
  - 'CHANNEL_ID'
```

```bash
gcloud alpha monitoring policies create \
  --project="${PROJECT_ID}" \
  --policy-from-file=alert_edit_p95_impacted.yaml
```

### 2.3 Cloud Run インスタンス使用率超過

```yaml
# alert_instance_util.yaml
displayName: '[memo-isolation] Cloud Run インスタンス使用率超過 (active >= 7/10 for 10m)'
combiner: OR
conditions:
  - displayName: 'アクティブインスタンス数 >= 7'
    conditionThreshold:
      filter: >-
        resource.type="cloud_run_revision"
        AND resource.labels.service_name="mosaku-backend"
        AND metric.type="run.googleapis.com/container/instance_count"
        AND metric.labels.state="active"
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_MAX
      comparison: COMPARISON_GT
      thresholdValue: 7
      duration: 600s
notificationChannels:
  - 'CHANNEL_ID'
```

```bash
gcloud alpha monitoring policies create \
  --project="${PROJECT_ID}" \
  --policy-from-file=alert_instance_util.yaml
```

### 2.4 DB コネクションプール使用率超過（Supabase pooler）

Supabase pooler（6543）の使用率はネイティブで Cloud Monitoring に出ないため、Supabase の DB メトリクス
（`pg_stat_activity` 由来の接続数 / プール上限比）を **Supabase ダッシュボードのアラート**、もしくは
接続数を定期 export するメトリクスで監視する。閾値はプール上限の 80%。

```yaml
# alert_db_pool.yaml（接続数メトリクスを別途 export している場合の例）
displayName: '[memo-isolation] DB プール使用率超過 (> 80% for 5m)'
combiner: OR
conditions:
  - displayName: 'Supabase pooler 使用率 > 80%'
    conditionThreshold:
      filter: 'metric.type="custom.googleapis.com/supabase/pooler_utilization"'
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_MEAN
      comparison: COMPARISON_GT
      thresholdValue: 0.8
      duration: 300s
notificationChannels:
  - 'CHANNEL_ID'
```

> プール使用率のネイティブ計測が未整備の場合は、暫定で Supabase ダッシュボードのアラート（Database → Reports →
> Connections）を `#mosaku-alerts` に連携する。

---

## 3. 数値トリガー定義表 と トリガー→分離段階 対応表 — Req 2.1 / 2.3 / 2.5

### 3.1 数値トリガー定義（閾値・継続時間付き）

母数 = `concurrency 100 × max-instances 10 = 1000 同時`。すべて**初期提案値**（実測でチューニング）。

| #   | トリガー                     | 観測源（§1 メトリクス）                                                               | 提案閾値（初期値）             | 継続時間 | 対応段階                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ | -------- | --------------------------------------- |
| T1  | 公開 req レート              | `public_memo_read_count` + `public_memo_read_throttled_count`（**429 含む和**, §1.4） | > 50 req/s（≒ 3000 req/分）    | 5 分     | **Stage 1**（CDN 化）                   |
| T2  | Cloud Run インスタンス使用率 | Cloud Run native `instance_count{state=active}`                                       | アクティブ ≥ 7 / 10（70%）     | 10 分    | **Stage 2** 候補                        |
| T3  | 編集系 p95 劣化              | `memo_edit_latency`（route 別 p95）＋ 公開 req 上昇相関                               | p95 > 800ms（または平常比 2×） | 5 分     | **Stage 2**（影響ありアラート Req 2.4） |
| T4  | DB コネクションプール使用率  | Supabase pooler（6543）使用率                                                         | > 80%                          | 5 分     | **Stage 3** 検討                        |

### 3.2 トリガー → 分離段階 対応表（Req 2.3）

| 発動トリガー                  | 一次的に発動すべき段階          | 補足                                                        |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------- |
| T1 公開 req レート超過        | Stage 1（CDN 前段キャッシュ化） | 編集にまだ影響が出ていなくても、公開吸収を最優先で着手      |
| T3 編集 p95 劣化（× T1 相関） | Stage 2（Cloud Run 2 分割）     | 「編集体験への影響あり」確定 → 公開読み取りサービス切り出し |
| T2 インスタンス使用率超過     | Stage 2 候補                    | Stage 1 で吸収しきれずプール枯渇に向かう兆候                |
| T4 DB プール使用率超過        | Stage 3（読み取りレプリカ）     | 公開読み取りの DB 負荷がプライマリを圧迫                    |

### 3.3 段階的・トリガー駆動の原則（Req 2.5）

> **通常運用（全トリガー閾値未超過）では、物理的なサービス分割や読み取りレプリカ構築を自動でも手動でも
> 要求しない。** 分離は上表のトリガーが**指定継続時間にわたり閾値超過**したときに限り、Playbook（§4）に従って
> **手動で段階発動**する。先行投資（過剰分割）も後手の障害も避けるための原則。

---

## 4. 段階的分離 Playbook — Req 5.1〜5.5

3 段階を**前提トリガー・適用順序・依存関係・ロールバック**込みで定義する。各段は前提トリガーが継続時間にわたり
閾値超過したときのみ手動発動する（§3.3）。状態遷移は design.md「トリガー判定と段階的分離の発動」図を参照。

### 4.1 段階一覧

| 段階        | 内容                                                                                                                                                      | 前提トリガー                                             | 適用順序 / 依存                                          | 本フェーズ実装                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| **Stage 1** | 公開読み取りの `Cache-Control` を `private, max-age=30, must-revalidate` → `public, s-maxage=<N>` 化し、CDN（Cloud CDN / フロント CDN）前段でヒットを吸収 | T1 公開 req レート超過                                   | 最初に発動。Stage 2/3 の前提（まず CDN で吸収を試みる）  | **文書のみ**（ヘッダ変更の実装は後続フェーズ） |
| **Stage 2** | Cloud Run を 2 分割し、公開読み取り専用サービスを切り出す。`PublicReadObservabilityInterceptor` をそのまま公開サービスへ移設し観測を引き継ぐ              | T3 編集 p95 劣化（× T1 相関）/ T2 インスタンス使用率超過 | Stage 1 で吸収しきれない場合に発動。Stage 1 適用後を前提 | **Non-Goal（Req 5.5）**                        |
| **Stage 3** | 公開読み取りを DB 読み取りレプリカへ向ける（`MemoSharingService.findByToken` の接続先を replica に）                                                      | T4 DB プール使用率超過                                   | Stage 2 の後（公開サービスが分離済みであることが前提）   | **Non-Goal（Req 5.5）**                        |

> 一方向 DI の継ぎ目（Req 3.1, `memo-sharing.dependency.spec.ts` で恒久検証済み）により、Stage 2 では
> 公開読み取り経路（`MemoSharingService` / `PublicMemoController` / 公開 Interceptor）を**依存逆流なしで**
> そのまま切り出せる。これが本フェーズの最大の準備成果。

### 4.2 Stage 1 のキャッシュ可能性と鮮度（無効化）要件 — Req 5.3

- **キャッシュ可能性**: 公開メモは未ログイン・読み取り専用で、レスポンスは `title/content/updatedAt` のみ
  （ユーザー固有要素なし）。したがって `public, s-maxage=<N>` で CDN 共有キャッシュに載せられる。
  `Vary: Accept` は維持する。
- **`s-maxage` 上限**: 鮮度とヒット率のトレードオフ。初期提案 **`s-maxage=60`〜`300`**（編集→公開反映の許容遅延に
  合わせて調整）。`max-age`（ブラウザ側）は現行の 30 を維持または短縮。
- **鮮度（キャッシュ無効化）要件**: 以下のイベントで CDN キャッシュを無効化し、古い内容が公開され続けるのを防ぐ。
  - **公開解除（`unpublishMemo`）**: 該当 `:token` パスを CDN purge。purge 反映までの間は 404 を返す経路を保証。
  - **トークン再生成（`regenerateToken`）**: 旧トークンは即失効（旧 URL は 404）→ 旧キャッシュは自然に無効化。
  - **メモ更新**: 公開中メモの本文更新時に該当 `:token` を CDN purge、または `s-maxage` の TTL 満了に委ねる
    （許容遅延内なら purge 省略可）。
- **トークン秘匿**: purge 対象 URL は `:token` を含むため、purge 操作ログにトークンが残らないよう取り扱う
  （ログ出力前に `normalizeRoute` 相当でマスク）。

### 4.3 各段階のロールバック（退避）手順 — Req 5.4

| 段階    | ロールバック手順                                                                                                                             | 確認項目                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Stage 1 | `Cache-Control` を `public, s-maxage=<N>` → `private, max-age=30, must-revalidate` に戻す → **CDN を全 purge**（または公開パス配下を purge） | 公開レスポンスに `private` が戻り、CDN にヒットしないこと。鮮度問題が解消すること                          |
| Stage 2 | 公開読み取り専用サービスへのルーティングを停止し、単一サービス（`mosaku-backend`）へ統合。公開 Interceptor を元モジュールへ戻す              | 公開・編集が単一サービスで応答し、`public_memo_read` / `memo_edit_read` の両メトリクスが継続発出されること |
| Stage 3 | 公開読み取りの接続先を replica → プライマリへ戻す（`MemoSharingService` の DB URL を元に戻す）                                               | 公開読み取りがプライマリで応答し、レプリケーション遅延起因の鮮度問題が消えること                           |

### 4.4 Non-Goal の明記 — Req 5.5

> **Stage 2・Stage 3 の物理実装は本フェーズの成果物に含めない。** 本 runbook はトリガー定義・発動手順・
> ロールバックの**文書化**までを成果物とし、実際のサービス分割・レプリカ構築はトリガー発動時に後続フェーズで
> 実施する。Stage 1（CDN ヘッダ化）の実装も後続フェーズ扱い（本フェーズは文書のみ）。

---

## 5. 運用チェックリスト（文書検証 — Operational Acceptance）

- [ ] §1: 公開 count（`status_class` ラベル）・公開 latency 分布・429 throttled 補完・編集 route 別 latency の 4 メトリクス定義が揃っている（Req 1.3 / 2.1 / 2.4）
- [ ] §1.4: 公開 req レート = served + throttled の和で算出する契約が明記されている（Req 2.1）
- [ ] §2: 公開 req レート / 編集 p95 劣化（公開相関＝影響ありアラート）/ インスタンス使用率 / DB プール使用率の 4 アラートが継続時間条件付きで定義されている（Req 2.2 / 2.4）
- [ ] §3.1: 4 系統トリガーが閾値・継続時間付きで明文化されている（Req 2.1）
- [ ] §3.2: トリガー→分離段階の対応表がある（Req 2.3）
- [ ] §3.3: 通常運用では分割を要求しない原則が明記されている（Req 2.5）
- [ ] §4.1: 3 段階が内容・前提トリガー・順序・依存込みで文書化されている（Req 5.1 / 5.2）
- [ ] §4.2: Stage 1 のキャッシュ可能性と無効化（鮮度）要件が明示されている（Req 5.3）
- [ ] §4.3: 各段階のロールバック手順がある（Req 5.4）
- [ ] §4.4: Stage 2/3 の物理実装が Non-Goal と明記されている（Req 5.5）

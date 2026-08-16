# Implementation Gap Analysis: memo-public-isolation

> 対象要件: `.kiro/specs/memo-public-isolation/requirements.md`（Requirement 1〜6）
> 分析日: 2026-05-30 / language: ja

## Analysis Summary

- **本フェーズの本質はコードより「観測 + 文書 + 継ぎ目の検証」**。物理分割（サービス2分割・読み取りレプリカ）は Non-Goal で、成果物は (1) 公開読み取りの観測分離、(2) 数値トリガー定義とアラート、(3) 疎結合の自動検証、(4) 段階的分離 Playbook の文書化に集約される。
- **疎結合の継ぎ目（Req 3）はすでに満たされている**。`MemoSharingService.findByToken` は `PrismaService` と `AuthorizationService` のみに依存し `MemoService` への参照ゼロ。残作業は「逆流を防ぐ自動チェック」の追加のみ（=テスト/lint で固める）で、新規実装はほぼ不要。
- **最大のギャップは「観測の粒度」**。`route` タグは現状 `applyStandardTags` が **生パス（トークン込み）** を入れており、(a) 高カーディナリティで集計不能、(b) 公開トークン（秘密値）が Sentry に流出、の二重問題。公開経路をルート正規化（`/memos/public/:token`）する小改修が Req 1・Req 6.3 の核心。
- **Cloud Monitoring への独立集計（Req 1.3）は方式未確定の Research Needed**。Cloud Run 標準メトリクスはサービス単位でルート別に割れない。ログベースメトリクス or Sentry トランザクションのどちらを真実源にするか設計判断が要る。
- **トリガー定義・Playbook（Req 2/5）は IaC 不在**。アラートは現状 Sentry Issue→Slack のみで、Cloud Monitoring アラートはコード化されていない。閾値・対応表・退避手順は新規ドキュメント（`docs/` 配下）として書き起こす。

## Document Status

gap-analysis.md フレームワーク（Current State → Feasibility → Approach Options → Effort/Risk）に従って既存コードを Grep/Read で精査し作成。外部依存の新規調査は不要（既存 Sentry/Cloud Run/Supabase スタック内で完結）。

---

## 1. Current State Investigation（現状資産）

### 1.1 公開読み取り経路（編集経路から独立済み）

| 資産                 | 場所                                                                                                 | 状態                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 公開コントローラ     | `backend/src/memo/public-memo.controller.ts`                                                         | `@Public()` + `@Throttle(60/分)` + `Cache-Control: private, max-age=30` を保持                               |
| 公開読み取りロジック | `backend/src/memo/memo-sharing.service.ts:147` `findByToken`                                         | `prisma` のみ参照。`MemoService` 非依存（**Req 3 達成済み**）                                                |
| データ境界           | `findByToken` の `where: { publicToken, trashedAt: null }` / `select: { title, content, updatedAt }` | 未公開・ゴミ箱を除外、内部ID/所有者情報を返さない（**Req 4 達成済み**）                                      |
| モジュール配線       | `backend/src/memo/memo.module.ts`                                                                    | `MemoController` と `PublicMemoController` が**同一 NestJS アプリ=同一 Cloud Run に同居**（=隔離対象の現状） |
| フロント取得         | `frontend/src/utils/api.ts:541` `requestPublic` / `components/public/PublicMemoPage.tsx`             | `apiClient` 経由・認証なし取得。直 `fetch` なし（**Req 6.1 達成済み**）                                      |

### 1.2 観測基盤（Sentry タグ契約）

- `backend/src/instrument.ts`: `beforeSend` で `applyStandardTags` を適用。`sampleRate: 1.0`（エラー全件）/ `tracesSampleRate` 本番 0.1（env 駆動・コード非依存、**Req 1.4 と整合**）。
- `backend/src/common/sentry/sentry-tags.ts`: 5タグ契約（`environment`/`release`/`feature_area`/`route`/`user_facing`）。`feature_area` enum 固定（`memo` 含む）。
- `resolveFeatureArea('/memos/...')` → `'memo'`。公開経路も編集経路も等しく `feature_area: 'memo'` に解決される（**Req 1.2 と整合**：feature_area は memo 固定、route で区別する設計）。

### 1.3 監視・アラートの現状

- `docs/deployment/sentry.md` §3: **Sentry Issue Alert → Slack `#mosaku-alerts`** が唯一のアラート経路。メトリクス（レート/レイテンシ）ベースのアラートは未整備。
- Cloud Monitoring のアラートポリシー・カスタムメトリクスは**コード/IaC として存在しない**（手動コンソール設定前提）。
- Cloud Run 構成（`docs/deployment/cloud-run.md`）: `--concurrency=100`, `--max-instances=10`, `--cpu=1 --memory=512Mi`。DB は Supabase pooler(6543)。→ トリガー閾値（インスタンス使用率・DBプール使用率）の母数はここから導出可能。

---

## 2. Requirement → Asset Map（ギャップ判定）

| Req                                           | 必要能力                             | 既存資産                              | 判定                                                                |
| --------------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------- |
| **1.1** 公開を route で区別計測               | `route` タグ付与                     | `applyStandardTags` が route 付与あり | ⚠️ **Constraint**: 生パス=トークン込みで高カーディナリティ&秘密流出 |
| **1.2** feature_area=memo 固定 + route で区別 | enum 固定済み                        | `resolveFeatureArea`→memo             | ✅ 達成                                                             |
| **1.3** Cloud Monitoring 独立集計             | ルート別 req/latency/error           | Cloud Run 標準はサービス単位のみ      | ❌ **Missing / Research Needed**（方式未定）                        |
| **1.4** 既存サンプリング枠内・env 非変更      | env 駆動済み                         | `instrument.ts`                       | ✅ 達成                                                             |
| **1.5** タグ欠落時フォールバック              | `applyStandardTags` フォールバック値 | 部分的（route 欠落時は欠落のまま）    | ⚠️ **Constraint**: 公開経路フォールバック契約の明文化要             |
| **2.1** 数値トリガー定義                      | 閾値文書                             | なし                                  | ❌ **Missing**（新規ドキュメント）                                  |
| **2.2** 閾値超過でアラート                    | Cloud Monitoring/Sentry 通知         | Sentry Issue→Slack のみ               | ❌ **Missing**（メトリクスアラート新設）                            |
| **2.3** トリガー→分離段階の対応表             | 文書                                 | なし                                  | ❌ **Missing**                                                      |
| **2.4** 編集 p95 劣化アラート                 | レイテンシ SLO アラート              | なし                                  | ❌ **Missing**                                                      |
| **2.5** 通常時は分割を要求しない              | 原則                                 | —                                     | ✅（設計方針として明記）                                            |
| **3.1-3.5** 一方向 DI の維持                  | 依存方向検証                         | コードは達成済み                      | ⚠️ **Constraint**: 逆流防止の**自動チェック未整備**                 |
| **4.1-4.5** データ/アクセス境界               | 公開のみ返却・読み取り専用           | `findByToken` + `@Public()` 限定      | ✅ ほぼ達成（回帰テストで固める）                                   |
| **5.1-5.5** 段階的分離 Playbook               | 3段階+前提+ロールバック文書          | なし                                  | ❌ **Missing**（新規ドキュメント）                                  |
| **6.1-6.5** 不変則維持                        | apiClient/RQ/enum/品質ゲート         | 全て達成中                            | ✅（破壊しないことの検証）                                          |

### 主要ギャップ詳細

**G1（最重要 / Req 1.1・6.3）— route タグのトークン流出と高カーディナリティ**
`sentry-tags.ts:75` は `route: pathname` をそのまま設定。`/memos/public/<秘密トークン>` がそのまま route タグになり、(a) トークン1個ごとに別ラベル化して集計不能、(b) 秘密値が Sentry に保存される。公開経路を `/memos/public/:token` に**正規化**する処理が必須。`PublicMemoController` の transaction 名（`PublicMemoController.findByToken`）を route 正規化のキーに使える。

**G2（Req 1.3）— Cloud Monitoring 独立集計の方式未定**
Cloud Run のビルトインメトリクス（request_count/latency）はサービス/リビジョン単位で、ルート（`/memos/public/*` vs 編集系）に割れない。選択肢: (i) 構造化ログ + **ログベースメトリクス**でルート別カウンタ化、(ii) Sentry トランザクション/パフォーマンスを真実源にする、(iii) OpenTelemetry カスタムメトリクス送出。→ design phase で1つに収束させる（**Research Needed**）。

**G3（Req 3.2-3.4）— 一方向 DI の自動検証不在**
現状は「たまたま依存していない」状態。逆流（`MemoSharingService` が `MemoService` を import）を CI で検出する仕組みがない。選択肢: ユニットテストで import グラフ検査 / ESLint `no-restricted-imports` / dependency-cruiser 等。

**G4（Req 2・5）— トリガー&Playbook ドキュメント不在**
閾値定義・アラートポリシー・3段階分離手順（CDN化→サービス2分割→読み取りレプリカ）・ロールバックが未文書。`docs/` 配下に新規作成。

---

## 3. Implementation Approach Options

### Option A: 既存資産を最小拡張（Extend）— 推奨

- **観測（Req 1）**: `sentry-tags.ts` に「公開経路のルート正規化」を追加（`/memos/public/<token>` → `/memos/public/:token`）。transaction ベースの正規化テーブルを1箇所に持たせる。
- **トリガー&Playbook（Req 2/5）**: `docs/deployment/` 配下に `memo-public-isolation-runbook.md`（仮）を新規追加。Cloud Monitoring アラートポリシーは**手順書 + （任意で）gcloud コマンド断片**として文書化（IaC 化は別フェーズ）。
- **DI 検証（Req 3）**: `memo-sharing.service.spec.ts` に「依存配列に MemoService が含まれない」ユニット検証を追加 or ESLint ルール。
- **境界回帰（Req 4）**: `findByToken` のゴミ箱/未公開/トークン無効ケースの回帰テストを増強。

**Trade-offs**: ✅ 新規ファイル最小・既存パターン踏襲・低リスク / ✅ Non-Goal を踏み越えない / ❌ Cloud Monitoring アラートが手動設定に残る（コード化されない）

### Option B: 観測レイヤを新規モジュール化（New）

公開観測を `backend/src/memo/observability/`（or `common/observability/`）として `PublicMemoObservabilityModule` 化し、NestJS Interceptor で公開経路のメトリクス/ログを発出。

**Trade-offs**: ✅ 責務分離が明確で将来のサービス切り出し時にそのまま移設可 / ✅ ルート別メトリクスを Interceptor で確実に発出（Req 1.3 を能動的に満たす） / ❌ Interceptor + ログベースメトリクス配線で実装量増 / ❌ 「いま作り込まない」方針とややテンション

### Option C: ハイブリッド（推奨度: 中）

- Phase 内即時: Option A（route 正規化 + DI テスト + ドキュメント）で要件を充足。
- 継ぎ目だけ将来移設しやすく: 公開メトリクス発出を**薄い Interceptor 1枚**に閉じ込め（Option B の最小核）、ログベースメトリクスのキーを公開経路で固定。

**Trade-offs**: ✅ 文書中心で軽量を保ちつつ Req 1.3 の実体（ルート別メトリクス）を Interceptor で担保 / ✅ 将来の物理分割時に Interceptor ごと移設可能 / ❌ Interceptor とログメトリクスの方式決定（G2）に design phase の判断が要る

---

## 4. Effort & Risk

| 作業領域                                         | Effort         | Risk       | 一言根拠                                                      |
| ------------------------------------------------ | -------------- | ---------- | ------------------------------------------------------------- |
| route 正規化（G1, Req1.1/6.3）                   | **S**          | Low        | `sentry-tags.ts` 局所改修 + 既存 spec パターン                |
| Cloud Monitoring 独立集計（G2, Req1.3）          | **M**          | Medium     | 方式選定（ログメトリクス/Sentry/OTel）が未定。配線は新規      |
| 一方向 DI 自動検証（G3, Req3）                   | **S**          | Low        | テスト or lint ルール追加のみ。コードは既に健全               |
| データ境界回帰テスト（Req4）                     | **S**          | Low        | `findByToken` の既存挙動を固定するだけ                        |
| トリガー定義 + アラート + Playbook（G4, Req2/5） | **M**          | Medium     | 文書主体だが閾値の妥当性判断・Cloud Monitoring 手順検証が要る |
| **全体**                                         | **M（3–7日）** | **Medium** | 実装は小粒だが Req1.3/Req2 の方式判断が design phase の鍵     |

---

## 5. Recommendations for Design Phase

### 推奨アプローチ

**Option A を主軸に、Req 1.3 のメトリクス発出だけ Option C の薄い Interceptor を検討**。「いま物理分割しない／文書とトリガーで備える」という要件の本質に最も忠実。

### Design phase での主要決定事項

1. **route 正規化の置き場所**: `sentry-tags.ts` 内の正規化テーブル拡張か、NestJS の正規化済み route（`reflector`/transaction）を信頼するか。公開経路 `/memos/public/:token` をどこで `:token` 化するか。
2. **Req 1.3 のメトリクス真実源（G2）**: ✅ **決定済み — Cloud Logging ログベースメトリクス**。薄い NestJS Interceptor で正規化ルート（`/memos/public/:token`）付きの構造化ログを発出し、Cloud Logging の log-based metric（counter=req数 / distribution=レイテンシ / filter status>=500=エラー率）として Cloud Monitoring に集計する。Sentry は errors/traces 専任のまま（0.1 サンプリングで rate が不正確・quota 圧迫のため真実源にしない）。インスタンス使用率・Cloud Run メトリクスはネイティブ取得（コード不要）。残る設計細部 → 後述。
3. **トリガー閾値の母数**: `--max-instances=10` / `--concurrency=100` / Supabase pooler コネクション上限から、各トリガー（公開 req レート・DBプール使用率・編集 p95 劣化・インスタンス使用率）の具体数値を設計。
4. **DI 逆流チェックの実装手段**: ユニットテスト vs ESLint `no-restricted-imports` vs dependency-cruiser。CI 統合コスト最小のものを選ぶ。
5. **Playbook の格納先と粒度**: `docs/deployment/` 新規ファイル。3段階（CDN化→サービス2分割→読み取りレプリカ）の前提トリガー・順序・ロールバックを表形式で。

### 決定済み（design の前提として確定）

- **[G2] メトリクス真実源 = Cloud Logging ログベースメトリクス**（2026-05-30 ユーザー合意）。Sentry / OTel は不採用。理由: 「いま作り込まない」方針への忠実さ・全件カウントの正確性・Cloud Monitoring アラート（Req 2.2）との直結。

### Research Needed（design phase へ持ち越し）

- **[G2 細部]** ログベースメトリクスの clean-label 化を「薄い NestJS Interceptor で正規化ルート付き構造化ログを発出」する案と「Cloud Run 標準リクエストログ（`httpRequest.requestUrl`）を regex フィルタ」する案のどちらにするか。後者はコード0だが Cloud Logging にトークンが残る retention 懸念あり → Interceptor 案が有力。
- **[G2 細部]** DB コネクションプール使用率（Req 2.1）はルート別に割れないため、Supabase pooler 全体使用率 × 公開 req スパイクの相関で代替する閾値設計。
- Cloud Monitoring アラートポリシーを IaC 化するか手順書に留めるか（本フェーズは後者を仮置き）。
- 第1段 CDN 化時の `public, s-maxage` 値と、公開解除/更新時のキャッシュ無効化（鮮度）方式（Req 5.3）。

---

## Next Steps

ギャップ分析は完了。design phase へ進む場合:

- `/kiro:spec-design memo-public-isolation` で技術設計書を作成
- または `/kiro:spec-design memo-public-isolation -y` で requirements 承認と設計を同時進行

> 注: requirements は `approved: false`（spec.json）。design phase は本ギャップ分析の前提で進められるが、承認フローを尊重するなら先に requirements を承認すること。

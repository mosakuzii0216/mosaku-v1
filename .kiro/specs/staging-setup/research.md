# Research & Design Decisions — staging-setup

---

## Summary

- **Feature**: `staging-setup`
- **Discovery Scope**: Complex Integration（既存本番インフラの Staging 複製）
- **Key Findings**:
  - Cloud Run・Vercel のデプロイ手順ドキュメントが `docs/deployment/` に既存。本番向けだが Staging 向けにそのまま流用できる。
  - Vercel は同一プロジェクトの「Preview 環境」が Staging 役割を果たせるため、Staging 専用プロジェクトは不要。
  - Supabase は無料プランで複数プロジェクト作成可能。Staging 用に別プロジェクトを作ることが DB 分離として最善策。

---

## Research Log

### 既存デプロイドキュメントの調査

- **Context**: Staging 構築前に既存手順との重複・差分を把握する
- **Sources Consulted**: `docs/deployment/cloud-run.md`, `docs/deployment/vercel.md`
- **Findings**:
  - Cloud Run デプロイは `mosaku-backend` というサービス名で想定されている
  - 環境変数は Secret Manager + 平文の組み合わせ（DATABASE_URL, JWT_SECRET は Secret Manager）
  - Vercel は GitHub 連携でブランチ Push → 自動デプロイ（main = Production、その他 = Preview）
  - Prisma マイグレーションは `DIRECT_URL`（ポート 5432）で `prisma migrate deploy` を手動実行
- **Implications**: Staging は既存ドキュメントの手順をほぼそのまま使えるが、サービス名・シークレット名・Supabase プロジェクトを Staging 専用に置き換えるだけで済む

### Vercel の Preview 環境について

- **Context**: Staging フロントエンドの置き場所をどうするか
- **Findings**:
  - Vercel は main ブランチ = Production、その他ブランチ = Preview として自動的に区別する
  - `staging` ブランチを作り、Vercel の環境変数を「Preview」環境に設定すれば Staging フロントエンドとして機能する
  - 追加コスト不要
- **Implications**: 新規 Vercel プロジェクトは不要。既存プロジェクトの Preview 環境変数を Staging 向けに設定する

### Supabase プロジェクトの分離

- **Context**: 本番 DB を汚染せずに Staging でマイグレーションを検証したい
- **Findings**:
  - Supabase 無料プランは最大 2 プロジェクト
  - Staging 用プロジェクトを作成し、`DATABASE_URL`・`DIRECT_URL` を Staging 向けに差し替える
  - コネクションプーリング URL（ポート 6543）とダイレクト URL（ポート 5432）の 2 種類が必要
- **Implications**: Supabase コンソールから Staging プロジェクトを作成し、接続文字列を取得して Secret Manager に登録する

### マイグレーションフローの決定

- **Context**: Staging にデプロイするたびに DB スキーマを安全に更新したい
- **Findings**:
  - `prisma migrate deploy` は冪等。既に適用済みのマイグレーションはスキップされる
  - Staging は手動実行（ローカルから `DIRECT_URL` を指定して実行）で十分。CI は Phase 0 スコープ外
- **Implications**: デプロイフローは「マイグレーション → Cloud Run デプロイ」の順序をドキュメント化するだけで良い

---

## Architecture Pattern Evaluation

| Option                       | Description                                               | Strengths                    | Risks / Limitations    | Notes                                                    |
| ---------------------------- | --------------------------------------------------------- | ---------------------------- | ---------------------- | -------------------------------------------------------- |
| Vercel 別プロジェクト        | Staging 専用の Vercel プロジェクトを作成                  | 完全分離                     | 追加設定・管理コスト増 | 不採用。Preview 環境で十分                               |
| Vercel Preview 環境（採用）  | 既存プロジェクトの staging ブランチを Staging として使用  | 追加コスト不要・設定最小     | ブランチ管理が必要     | Staging 用途として標準的                                 |
| GCP 別プロジェクト           | Staging 用 GCP プロジェクトを作成                         | 課金・権限が完全分離         | 設定コスト大           | 不採用。同一プロジェクト内でサービス名を分けるだけで十分 |
| Cloud Run 別サービス（採用） | 同一 GCP プロジェクト内に `mosaku-backend-staging` を作成 | セットアップ簡単・コスト最小 | 本番との権限境界が薄い | Phase 0 では許容範囲                                     |

---

## Design Decisions

### Decision: Vercel Preview 環境を Staging として使用する

- **Context**: Staging フロントエンドを最小コストで用意したい
- **Alternatives Considered**:
  1. Staging 専用 Vercel プロジェクト — 設定・管理コストが増える
  2. Vercel Preview 環境 — 既存プロジェクトの機能をそのまま活用
- **Selected Approach**: `staging` ブランチを作成し、Vercel の Preview 用環境変数に Staging バックエンド URL・Supabase URL を設定する
- **Rationale**: Phase 0 のゴールは「安全に本番デプロイできる確認環境を用意すること」であり、完全分離よりも迅速な構築を優先する
- **Trade-offs**: ブランチ管理が必要になるが、Git フローの一部として自然
- **Follow-up**: Preview 環境の環境変数が本番と混在しないよう設定値を確認する

### Decision: Cloud Run は同一 GCP プロジェクト内に別サービスを作る

- **Context**: Staging バックエンドを本番と分離したい
- **Alternatives Considered**:
  1. 別 GCP プロジェクト — 課金・権限が完全分離、設定コスト大
  2. 同一プロジェクト内の別サービス（採用） — 設定コスト最小
- **Selected Approach**: サービス名を `mosaku-backend-staging` とし、本番 `mosaku-backend` と同一プロジェクト内で並存させる
- **Rationale**: Phase 0 の規模では完全分離は過剰。シークレット名を `*-staging` サフィックスで区別すれば十分
- **Trade-offs**: 本番と権限が共有されるが、IAM でサービスアカウントを分ければ許容できる

### Decision: マイグレーションは手動実行（ローカルから）

- **Context**: Staging DB に安全にマイグレーションを適用したい
- **Alternatives Considered**:
  1. CI/CD パイプライン（GitHub Actions）でマイグレーション自動実行 — 完全自動化、設定コスト大
  2. 手動実行（採用） — シンプル、Phase 0 では十分
- **Selected Approach**: デプロイ前にローカルから `DIRECT_URL=<staging> npx prisma migrate deploy` を実行する手順をドキュメント化
- **Rationale**: Phase 0 のデプロイ頻度は低く、CI 自動化は Phase 1 以降でよい
- **Trade-offs**: 手動ステップのため忘れるリスクがあるが、デプロイチェックリストで担保する

---

## Risks & Mitigations

- 本番と Staging が同一 GCP プロジェクトで混在 → Secret Manager のシークレット名に `-staging` サフィックスをつけて区別する
- Supabase の無料枠（2プロジェクト）を超える可能性 → 現在1プロジェクトのみ使用中なので問題なし
- Vercel Preview 環境変数の誤設定（本番 DB を参照してしまうリスク）→ Staging 環境変数設定後に URL を明示的に確認する手順をチェックリストに含める
- OAuth コールバック URL の未登録 → Google Cloud Console・GitHub OAuth App にも Staging URL を登録する手順を設計に含める

---

## References

- `docs/deployment/cloud-run.md` — Cloud Run デプロイ詳細手順（本番向けだが Staging にも適用可）
- `docs/deployment/vercel.md` — Vercel デプロイ詳細手順（同上）

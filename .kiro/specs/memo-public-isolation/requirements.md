# Requirements Document

## Project Description (Input)

memo-public-isolation: 公開メモの未ログイン閲覧トラフィックを、ログインユーザー（メモ編集者）のトラフィックから隔離し、公開メモがSNS等で拡散・爆増しても編集体験（保存・編集・一覧）に影響を与えないようにする。背景: Mosakuは招待制クローズドコミュニティで編集者数は予測可能だが、公開メモ(/p/:token, GET /memos/public/:token)は外部拡散により青天井で跳ねうる非対称性を持つ。現状(memo-public-sharing実装後)はPublicMemoControllerとMemoControllerが同一NestJSアプリ=同一Cloud Runサービスに同居し、インスタンスプール・DBコネクションプール(Supabase pooler 6543)・Nodeイベントループを共有しているため、閲覧爆増が編集トラフィックを巻き込むリスク(bulkheadなし)がある。緩和は現状IP60req/分のレート制限とprivate max-age=30のブラウザキャッシュのみ。ゴール: (1)今すぐは大規模作り込みをせず「いつ分離に着手するか」の発動トリガーを数値で定義しCloud Monitoring/Sentryでアラート化、(2)コードの継ぎ目(MemoSharingService.findByTokenがMemoServiceに依存しない一方向DI)を維持し将来のサービス分割を低コスト化、(3)段階的な分離オプション(Cache-Controlをpublic s-maxageに変えCDN前段で吸収→Cloud Runサービス2分割でpublic読み取り専用サービス化→公開読み取りをDB読み取りレプリカへ)を設計として明文化。Non-Goal: 今この場での物理的サービス分割の実装そのもの(段階的・トリガー駆動で発動)。既存の不変則(apiClient経由・AuthorizationService一元化・@Public opt-out・React Query真実の源泉・Sentry feature_area:memo enum固定)は維持する。

## Introduction

本仕様は、公開メモ（未ログインで閲覧可能な `/p/:token` ／ `GET /memos/public/:token`）の閲覧トラフィックと、招待制ログインユーザーによる編集トラフィック（保存・編集・一覧）との間に、障害伝播の壁（bulkhead）の素地を作り、SNS 拡散等による公開閲覧の爆発的増加が編集体験を劣化させないことを保証するためのものである。

本フェーズの本質は「いま物理的にサービスを分割すること」ではなく、次の3点を満たすことにある。

1. 観測可能性: 分離に着手すべきかを数値トリガーで判定できるよう、公開閲覧と編集のトラフィック・リソース消費を分離して観測・アラート化する。
2. 疎結合の維持: 将来のサービス分割を低コストで行えるよう、公開読み取り経路（`MemoSharingService.findByToken`）が編集経路（`MemoService`）へ依存しない一方向 DI の継ぎ目を維持・検証する。
3. 段階的分離の明文化: トリガー発動時に段階的に発動できる分離オプション（CDN 前段キャッシュ → Cloud Run サービス2分割 → 読み取りレプリカ）を設計として明文化し、発動条件と退避手順を準備する。

物理的なサービス分割そのもの、および読み取りレプリカの実構築は本フェーズの Non-Goal であり、トリガー駆動で後続フェーズに発動される。既存のアーキテクチャ不変則（`apiClient` 経由・`AuthorizationService` 一元化・`@Public()` opt-out・React Query を真実の源泉・Sentry の `feature_area:memo` enum 固定）はすべて維持する。

## Requirements

### Requirement 1: 公開閲覧トラフィックの観測分離（Observability Isolation）

**Objective:** As a Mosaku 運用者, I want 公開メモの閲覧トラフィックを編集トラフィックと区別して観測したい, so that どちらが負荷を生んでいるかを切り分け、分離着手の判断とスケール調整を根拠を持って行える

#### Acceptance Criteria

1. When 公開読み取りエンドポイント（`GET /memos/public/:token`）へのリクエストが処理されたとき, the Public Memo Observability Module shall そのリクエストを編集系エンドポイントと区別できるルート識別子（`route` タグまたはメトリクスラベル）付きで計測する
2. When 公開読み取りリクエストでエラーまたはイベントが Sentry に送出されたとき, the Public Memo Observability Module shall `feature_area` タグを既存 enum の `memo` に固定し、`route` タグで公開経路と編集経路を区別可能にする
3. The Public Memo Observability Module shall 公開読み取りのリクエスト数・レイテンシ・エラー率を、編集系メトリクスから独立して集計できる形式で Cloud Monitoring に提供する
4. Where Sentry のサンプリングが有効な環境であるとき, the Public Memo Observability Module shall 公開読み取り経路のトレースを既存のサンプリング戦略（本番 trace 0.1）の枠内で取得し、env 変更なしのコード変更でサンプリング率を変更しない
5. If 公開読み取り経路の計測に必要なタグまたはラベルが欠落しているとき, then the Public Memo Observability Module shall 既存タグ契約（`environment` / `release` / `feature_area` / `route` / `user_facing` の5タグ必須）を満たすフォールバック値を付与する

### Requirement 2: 分離着手トリガーの数値定義とアラート化（Trigger Definition & Alerting）

**Objective:** As a Mosaku 運用者, I want 「いつ物理分離に着手すべきか」を主観でなく数値で判断したい, so that 過剰な先行投資も後手の障害も避け、トリガー駆動で段階的に分離を発動できる

#### Acceptance Criteria

1. The Isolation Trigger Definition shall 分離着手を判断するための数値トリガー（少なくとも公開読み取りリクエストレート、公開読み取りに起因する DB コネクションプール使用率、編集系エンドポイントのレイテンシ劣化、Cloud Run インスタンス使用率を含む）を明文化された閾値として定義する
2. When 定義された数値トリガーのいずれかが指定の継続時間にわたって閾値を超過したとき, the Isolation Trigger Alerting shall Cloud Monitoring または Sentry を通じて運用者にアラートを通知する
3. The Isolation Trigger Definition shall 各トリガーに対し、どの段階的分離オプション（Requirement 5）を発動すべきかの対応関係を文書として定義する
4. If 公開読み取りトラフィックが急増し編集系エンドポイントの p95 レイテンシが定義された劣化閾値を超えたとき, then the Isolation Trigger Alerting shall これを「編集体験への影響あり」として識別可能なアラートを発火する
5. While トリガー閾値が未超過の通常運用状態であるとき, the Isolation Trigger Definition shall 物理的なサービス分割や読み取りレプリカ構築を自動でも手動でも要求しない（段階的・トリガー駆動の原則を維持する）

### Requirement 3: 公開読み取り経路の疎結合維持（One-Way DI Seam）

**Objective:** As a Mosaku 開発者, I want 公開読み取り経路が編集経路に依存しない一方向の継ぎ目を維持したい, so that 将来サービスを2分割する際に依存の逆流による分割コストの増大を避けられる

#### Acceptance Criteria

1. The Memo Sharing Service shall 公開読み取りロジック（`MemoSharingService.findByToken` 相当）が編集系サービス（`MemoService`）へ依存しない一方向 DI を維持する
2. When 公開読み取り経路のコードが変更されたとき, the Memo Sharing Service shall 編集系サービスへの逆方向依存が混入していないことをテストまたは依存方向チェックで検証可能にする
3. Where 公開読み取りと編集が共通ロジックを必要とするとき, the Memo Sharing Service shall 共通部分を双方が依存可能な下位（共通基盤）レイヤーに配置し、編集系サービス経由の間接依存を作らない
4. If 公開読み取り経路から編集系サービスへの新規依存が導入されようとしたとき, then the Memo Sharing Service shall その依存を不正な結合としてレビューまたは自動チェックで検出できるようにする
5. The Memo Sharing Service shall 所有権チェックを要しない公開読み取り経路においても、既存の `@Public()` opt-out 方針と `AuthorizationService` 一元化方針に反する直接的な認可バイパスを新設しない

### Requirement 4: 公開メモのデータ隔離とアクセス境界（Data & Access Boundary）

**Objective:** As a 公開メモの所有者およびシステム管理者, I want 公開トークン経由で露出するのは明示的に公開されたメモのみであることを保証したい, so that 未公開・ゴミ箱・他者の非公開メモが公開経路から漏えいするのを防ぎ、ユーザーの信頼を維持できる

#### Acceptance Criteria

1. When 有効な公開トークンで `GET /memos/public/:token` がリクエストされたとき, the Public Memo Access Boundary shall 公開状態として明示されたメモのみを返却する
2. If 指定トークンに対応するメモが存在しない、公開が解除されている、またはゴミ箱（soft delete）状態であるとき, then the Public Memo Access Boundary shall メモ本文を返却せず、存在を推測されにくい応答（404 等）を返す
3. When 公開読み取りレスポンスを構築するとき, the Public Memo Access Boundary shall 公開に不要な内部・所有者識別情報（編集用 ID 体系や所有者の個人情報等）を含めない
4. The Public Memo Access Boundary shall 公開読み取り経路を `@Public()` で明示的にオプトアウトされたエンドポイントに限定し、それ以外のメモエンドポイントはグローバル JWT Guard による保護を維持する
5. While メモが公開状態にあるとき, the Public Memo Access Boundary shall 公開トークン経由のアクセスに対し編集・削除・所有権変更を許可せず、読み取り専用境界を維持する

### Requirement 5: 段階的分離オプションの設計明文化（Staged Separation Playbook）

**Objective:** As a Mosaku アーキテクト, I want トリガー発動時に発動できる段階的分離オプションを順序・前提・退避手順込みで明文化したい, so that 障害発生時に設計を即興で考えることなく、準備済みの手順で対応できる

#### Acceptance Criteria

1. The Staged Separation Playbook shall 段階的分離オプションを少なくとも3段階（第1段: 公開読み取りの `Cache-Control` を `private, max-age=30` から `public, s-maxage` 系に変更し CDN 前段で吸収、第2段: Cloud Run サービスを2分割し公開読み取り専用サービスを切り出す、第3段: 公開読み取りを DB 読み取りレプリカへ向ける）として文書化する
2. The Staged Separation Playbook shall 各段階について、発動の前提となるトリガー（Requirement 2）と、適用順序・依存関係を文書として定義する
3. Where 第1段（CDN キャッシュ化）が適用されるとき, the Staged Separation Playbook shall 公開メモのキャッシュ可能性と、公開解除・更新時のキャッシュ無効化（鮮度）要件を文書として明示する
4. The Staged Separation Playbook shall 各分離段階に対するロールバック（退避）手順を文書として定義する
5. While いずれの分離段階も未発動であるとき, the Staged Separation Playbook shall 第2段・第3段の物理実装を本フェーズの成果物に含めない（Non-Goal を維持する）

### Requirement 6: 既存アーキテクチャ不変則の維持（Invariant Preservation）

**Objective:** As a Mosaku メンテナ, I want 本フェーズの変更が既存の不変則を一切破壊しないことを保証したい, so that 観測性追加や疎結合維持のためにコードベース全体の一貫性が失われるのを防げる

#### Acceptance Criteria

1. The Public Memo Isolation Feature shall フロントエンドからの公開メモ取得を含む全 API コールを `apiClient`（`utils/api.ts`）経由に維持し、直接 `fetch` を新設しない
2. The Public Memo Isolation Feature shall サーバー状態の真実の源泉を React Query に維持し、公開メモデータを Zustand へコピーしない
3. The Public Memo Isolation Feature shall Sentry の `feature_area` enum を既存定義（`memo` を含む固定セット）から逸脱させない
4. When 公開読み取り経路に計測・タグ・キャッシュ設定を追加するとき, the Public Memo Isolation Feature shall 既存の `@Public()` opt-out・`AuthorizationService` 一元化・helmet セキュリティヘッダー・既存レート制限（IP 60req/分）の方針を破壊しない
5. If 本フェーズの変更が既存テストまたはリント・型チェックを破壊するとき, then the Public Memo Isolation Feature shall その変更をマージ可能とせず、既存品質ゲートを通過させる

# Requirements Document

## Project Description (Input)

dogfooding-friction-log: Mosaku を自分で毎日使う「ドッグフーディング」期間中に発生した摩擦（不便・違和感・バグ・欲しい機能）を素早く記録し、週次でトリアージして cc-sdd の spec 化候補に流すための、記録の受け皿と運用ルールを設計する。

### 背景・目的

Phase 1（2026年5月〜7月）でドッグフーディングを開始するにあたり、摩擦を取りこぼさずに Top3 を spec 化していく仕組みが必要。既存の代替運用（Notion 等の外部ツールでメモる）は Mosaku を閉じる時間が発生するため、できる限り Mosaku 内で完結させたい。

### 検討ポイント

1. **記録手段** — アプリ内フォーム / 専用ノートブック / GitHub Issues 等の選定
2. **記録する摩擦の粒度・テンプレ** — 何が起きた / 何をしたかった / 深刻度 / 領域タグ
3. **トリアージ運用** — 週次振り返り、Top3 選定基準、spec 化済みフラグ
4. **Slack Webhook 連携の要否**
5. **将来友人公開時にユーザーからも摩擦を受け取れる拡張余地**

### 非スコープ

- 一般ユーザー向けのフィードバックフォーム（Phase 2 で別 spec 化予定）
- Sentry からの自動摩擦記録（`sentry-integration` spec に含む）

### 技術的制約

- 新規 JS ライブラリ追加は最小限
- バックエンドは既存ドメイン構成（memo / tag / notebook 等）の範囲で完結させる方針を優先する

## Introduction

ドッグフーディング期間中、Mosaku 本人が Mosaku を使っている最中に発生する摩擦（不便・違和感・バグ・欲しい機能）を、Mosaku の外に出ずに記録し、週次レビューで Top3 を選定して cc-sdd の spec 化候補へ流すための仕組みを定義する。記録基盤は新規ドメインを増やさず、既存の memo / notebook / tag ドメインの範囲で完結させ、テンプレートとメタデータ（深刻度・領域・spec 化ステータス）で摩擦ログとしての性格を与える。週次トリアージは Mosaku 内で閉じる運用を基本とし、重大摩擦のみ任意で Slack Webhook に通知する。友人公開フェーズ（Phase 3 以降）で一般ユーザーの摩擦受付を追加する際にもデータモデルを引き継げるよう、摩擦レコードの構造を「記録者が誰か」に依存しない形に設計する。

## Requirements

### Requirement 1: 摩擦ログ記録基盤（既存ドメイン活用）

**Objective:** Mosaku 開発者として、ドッグフーディング中の摩擦を既存の memo / notebook / tag 機能の延長線上で保存したい。新しいドメインを増やさず、記録手段の切り替えコストをゼロにするため。

#### Acceptance Criteria

1. The Mosaku system shall 摩擦ログを「専用ノートブック（例: `Friction Log`）配下のメモ」として永続化する。
2. The Mosaku system shall 摩擦ログ用ノートブックを、通常メモと同じ `memo` / `notebook` ドメインの API・DB スキーマで扱い、摩擦専用テーブルを追加しない。
3. When 摩擦ログ用ノートブックが未作成の状態で初回の摩擦記録が行われたとき, the Mosaku system shall 既存の notebook 作成 API を通じて専用ノートブックを自動生成するか、既存ノートブックから選択させるフローを提示する。
4. The Mosaku system shall 摩擦ログメモに対しても、通常メモと同じ所有権チェック（`AuthorizationService.checkOwnership()`）・自動保存・ゴミ箱機能を有効にする。
5. Where 既存の tag ドメインが利用可能な場合, the Mosaku system shall 摩擦の領域分類（例: `editor`・`theme`・`auth`・`mobile`）をタグとして表現し、タグの追加・編集は既存 tag API を再利用する。

### Requirement 2: 摩擦レコードのテンプレートとメタデータ

**Objective:** Mosaku 開発者として、記録した摩擦を後から読み返したときに「何が起きたか／何をしたかったか／どれくらい深刻か／どこの領域か」を一目で判断できるようにしたい。曖昧な記録が増えてトリアージが回らなくなる事態を防ぐため。

#### Acceptance Criteria

1. When 新規の摩擦ログメモが作成されるとき, the Mosaku system shall 以下の項目を含むテンプレートを本文に自動挿入する: 発生日時、何が起きたか（現象）、何をしたかったか（期待動作）、深刻度、領域タグ、再現手順（任意）。
2. The Mosaku system shall 深刻度を `blocker` / `major` / `minor` / `nice-to-have` の 4 段階で表現し、いずれか 1 つをメモ側のメタデータとして保持する。
3. The Mosaku system shall 領域タグを Requirement 1 で定義したタグドメインから選択させ、少なくとも 1 つの領域タグを付与することを推奨する（未設定でも保存は可能）。
4. If 深刻度または領域タグが未設定のまま摩擦ログメモが保存されたとき, the Mosaku system shall 警告を表示するが、保存自体はブロックしない（記録の取りこぼしを防ぐため）。
5. The Mosaku system shall テンプレート定義をフロントエンド側の定数（例: `frontend/src/constants/frictionTemplate.ts`）に 1 箇所で管理し、新規ライブラリ追加なしに TipTap エディタで初期コンテンツとして挿入する。

### Requirement 3: 素早い記録 UX（Mosaku 内で完結）

**Objective:** Mosaku 開発者として、作業中に摩擦を感じた瞬間に最短 2 ステップで記録を開始したい。Notion など外部ツールに切り替える時間を作らず、摩擦の取りこぼしをゼロに近づけるため。

#### Acceptance Criteria

1. The Mosaku system shall 摩擦ログ記録用のグローバル導線（例: ショートカットキー `Ctrl/Cmd + Shift + F`、またはヘッダー内のアイコン）を提供し、任意のビューから 1 アクションで摩擦ログ専用ノートブックの新規メモ編集画面に遷移できるようにする。
2. When 摩擦ログ記録ショートカットが起動されたとき, the Mosaku system shall Requirement 2 のテンプレートを適用した新規メモを作成し、自動保存（2 秒デバウンス）を通常メモと同じ挙動で有効にする。
3. While 編集中のメモがある状態で摩擦ログ記録ショートカットが起動されたとき, the Mosaku system shall 現在編集中のメモの自動保存を待ってから摩擦ログ画面へ遷移し、未保存編集の喪失を避ける。
4. Where モバイルビューが表示されている場合, the Mosaku system shall ショートカットキーの代替として、画面内の到達可能な位置（例: モバイル用の FAB もしくは既存メニュー項目）から摩擦ログ記録を 1 タップで開始できる導線を提供する。
5. The Mosaku system shall 摩擦ログ記録機能の実装において、新規 JS ライブラリの追加を行わず、既存の React・Zustand・React Query・TipTap のみで構成する。

### Requirement 4: 週次トリアージと spec 化連携

**Objective:** Mosaku 開発者として、毎週金曜の振り返りで摩擦ログから Top3 を選定し、cc-sdd で spec 化した摩擦を「対応済み」として識別したい。spec 化漏れと二重 spec 化を防ぎ、Phase 1 の週 5 時間枠で優先度の高い摩擦から潰すため。

#### Acceptance Criteria

1. The Mosaku system shall 摩擦ログ専用ノートブック内で、記録済みの摩擦を深刻度・発生日時・spec 化ステータスで並べ替え／絞り込みできるビューを提供する（既存の memo 一覧 UI に依存してよい）。
2. The Mosaku system shall 各摩擦メモに対し、`spec 化ステータス` を `未着手` / `spec 化済み` / `対応完了` / `却下` の 4 値で管理し、メモ側メタデータ（深刻度と同じ格納先）に保持する。
3. When 摩擦が cc-sdd の spec として起票されたとき, the Mosaku system shall 当該摩擦メモに spec 名（例: `dogfooding-friction-log`）または spec ディレクトリへの参照文字列を本文末尾の所定セクションに記録できるようにする。
4. While 週次トリアージモードが有効なとき, the Mosaku system shall 過去 7 日間に記録された摩擦のうち、spec 化ステータスが `未着手` かつ深刻度が `blocker` / `major` のものを優先的に表示する。
5. The Mosaku system shall Top3 選定の基準を開発者が判断できるよう、各摩擦に対して「同種の摩擦が過去に何件あるか（同じ領域タグ × 深刻度で集計）」を表示する。
6. If ある摩擦メモの spec 化ステータスが `対応完了` に遷移したとき, the Mosaku system shall 当該メモをゴミ箱に送らず、トリアージビューのデフォルト表示から自動的に除外するのみに留める（履歴として保持するため）。

### Requirement 5: Slack Webhook による重大摩擦通知（任意機能）

**Objective:** Mosaku 開発者として、深刻度 `blocker` の摩擦だけは即座に Slack へ共有し、作業を中断してでも後で必ず見返せるようにしたい。重大摩擦が摩擦ログ画面に埋もれるのを防ぐため。

#### Acceptance Criteria

1. Where 環境変数 `SLACK_WEBHOOK_URL`（または相当の設定）が提供されている場合, the Mosaku system shall Slack Webhook 連携を有効化する。
2. When 深刻度 `blocker` の摩擦ログメモが新規保存または深刻度変更によって `blocker` に遷移したとき, the Mosaku system shall Slack Webhook に対して摩擦の「タイトル（メモタイトル）・領域タグ・現象要約（本文冒頭 N 文字）・メモへのディープリンク」を含むペイロードを 1 回送信する。
3. If `SLACK_WEBHOOK_URL` が未設定の場合, the Mosaku system shall 通知処理をスキップし、摩擦ログ記録そのものは正常に完了させる。
4. If Slack Webhook への送信が失敗したとき, the Mosaku system shall 摩擦ログメモ自体の保存はロールバックせず、失敗を Sentry またはサーバーログに記録するに留める。
5. The Mosaku system shall Slack 通知の重複送信を避けるため、同一メモに対する `blocker` 通知は 1 回のみ送信する（深刻度を一度下げて再度 `blocker` に戻しても、同一メモでは 24 時間以内の再送信を行わない）。

### Requirement 6: 非機能要件・拡張余地・境界

**Objective:** Mosaku 開発者として、摩擦ログ機能がパフォーマンス・運用・将来拡張の面で Mosaku 本体に悪影響を与えず、かつ Phase 2 以降の一般ユーザー向けフィードバック基盤の土台になるようにしたい。

#### Acceptance Criteria

1. The Mosaku system shall 摩擦ログ記録および一覧取得を、通常メモ操作と同等のレイテンシ（実用上差が体感できない範囲）で完了させる。
2. The Mosaku system shall 摩擦ログに関する追加の依存として、バックエンドの `@nestjs/axios` 等の Slack 通知実装が必要な場合でも、既存に存在する機構（`fetch` / 既存 HTTP クライアント）を優先し、新規ライブラリ追加を避ける。
3. The Mosaku system shall 摩擦レコードのメタデータ設計（深刻度・領域タグ・spec 化ステータス・記録者）を、将来的に一般ユーザーからの摩擦受付（`user-feedback` 系 spec）を追加する際に、同一スキーマ／同一 API で拡張可能な構造に保つ。
4. The Mosaku system shall 摩擦ログ機能の対象を「認証済み開発者アカウント（ADMIN ロール）」のみに限定し、一般 USER ロールからは記録導線が表示されないようにする（Phase 1 時点）。
5. The Mosaku system shall 本 spec の非スコープを以下のとおり明示する:
   - 一般ユーザー向けのフィードバックフォーム（Phase 2 で `user-feedback` 等の別 spec として扱う）
   - Sentry のエラーイベントからの自動摩擦記録（`sentry-integration` spec の範囲）
   - AI による摩擦の自動分類・要約（Phase 3 以降の AI 連携 spec の範囲）
6. If 本 spec と他 spec（`sentry-integration` / `user-feedback` 等）の境界で機能が重複しそうになったとき, the Mosaku system shall 本 spec では「手動で記録する摩擦の受け皿」に責務を限定し、自動記録・外部ユーザー受付は他 spec に委譲する。

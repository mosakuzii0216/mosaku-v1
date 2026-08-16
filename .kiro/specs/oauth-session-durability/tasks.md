# Implementation Plan

> 実装順序は design.md「Migration Strategy」に従う: (1) 互換ゲートを起点で単独検証 → (2) X 経路整流化 → (3) env 統一。
> ゲート（Task 1.1）が NG の場合のみ Option B（connect-pg-simple）へ切替（`research.md`「Option B フォールバック最小スケッチ」参照）。

- [x] 1. セッションストアを cookie-session に置換（互換ゲート優先）
- [x] 1.1 互換ゲート検証と cookie-session ミドルウェア導入
  - 最初に RED テストとして「passport-oauth2 が cookie-session 上で CSRF state と PKCE code_verifier を往復できる」round-trip 統合テストを作成する（X ログイン開始でこれらが署名付き Cookie に載り、コールバックで復元・検証が通ること）
  - デフォルト MemoryStore を使う既存のセッション機構を撤去し、全インスタンスから参照可能な署名付き Cookie ベースのセッションへ置換する
  - 起動時に永続化バックエンドでセッションミドルウェアを構成し、ログイン開始とコールバックが別インスタンスに到達しても保存値を解決できるようにする
  - ミドルウェア適用順序（helmet → cookie-parser → セッション → CORS）を維持する
  - NG 時は Option B（サーバー側 Postgres ストア）へ切替するため、ゲート結果を白黒つけてから次へ進む
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2_

- [x] 1.2 Cookie 属性とセキュリティ・クロスオリジン整合
  - 本番環境ではセッション Cookie に secure と httpOnly を設定する
  - クロスオリジン構成（mosaku.jp ↔ api.mosaku.jp）と OAuth リダイレクトが成立するよう sameSite 属性を適切に設定し、env で上書き可能にする
  - 既存の helmet（CSP 含む）・CORS（credentials: true）・cookie-parser 設定と矛盾しない構成を維持する
  - ペイロード（CSRF state + PKCE code_verifier + 招待コード）が Cookie サイズ上限内に収まることを保証する
  - Cookie の有効期間を OAuth フロー完了に十分かつ過度に長くない範囲（既定 10 分）に設定する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.3 セッション秘密鍵の env 管理と本番未構成検知
  - セッション署名鍵を環境変数から取得し、ハードコードしないことをテストで担保する（既存 fail-fast の回帰）
  - 本番環境では MemoryStore へフォールバックせず、永続化バックエンドまたは秘密鍵が未構成の場合に起動時の検知可能なエラー／警告を出力する
  - 全インスタンスで同一の署名鍵が前提であること（不一致だと別インスタンス到達時にサイレント失敗）をコメント／検証で明示する
  - _Requirements: 1.3, 4.1, 4.3_

- [x] 2. X OAuth 経路の整流化（passport 一本化）
- [x] 2.1 招待登録の開始ガードと state 検証失敗ハンドリング
  - X 招待登録の開始経路で招待署名 state を検証し、成功時のみ招待コードをセッションに格納してから passport の認証へ委譲する
  - state が不一致・欠落・期限切れの場合は passport へ進めず拒否する
  - 検証失敗時は専用例外を throw し、ExceptionFilter が invite ページへ `error=invalid_state` でリダイレクトする（guard 内での直接リダイレクトは二重送出を招くため採らない）
  - 開始経路を踏まず直接コールバックへ到達した場合はログイン分岐になる（誤登録防止）ことを確認する
  - _Requirements: 2.4, 2.5_

- [x] 2.2 X コールバックの register/login 分岐
  - X コールバックは他 4 社の共通コールバック経路を経由せず、passport のランダム CSRF state を招待署名 state と誤認しないようにする
  - セッションの招待コードの有無で招待登録／通常ログインを分岐し、登録に用いた招待コードは消費後に削除する
  - 認証成立時のユーザー識別・JWT 発行・refresh cookie・成功リダイレクト挙動を既存と同一に維持する
  - _Requirements: 2.2, 2.3, 2.4, 2.6_

- [x] 2.3 招待登録 start のダミー PKCE 撤去
  - X の招待登録開始は他 4 社と同様に招待検証と署名 state 発行を行いつつ、返す認可 URL を backend の登録開始経路（署名 state 付き）に差し替える
  - ダミー PKCE を発行していた X 専用の認可 URL 生成ロジックを撤去／差し替えし、他 4 社の URL 生成は不変に保つ
  - フロントエンドへ返す `{ authorizationUrl }` 契約は不変に保つ（FE 改修不要）
  - _Requirements: 2.4_

- [x] 2.4 (P) X プロバイダ未構成時の挙動（回帰）
  - X の Client ID/Secret が空の場合は既存どおり警告ログを出して起動を継続することを確認する
  - X ログイン要求に対して構成不備を示す応答（503）を返すことを確認する
  - _Requirements: 2.7_

- [x] 3. (P) 環境変数ドキュメントの整合
  - `.env.example` の X キーを統一し（`X_CONSUMER_*` → `X_CLIENT_*`）、リダイレクト URI と整合させる
  - セッション秘密鍵およびセッション Cookie 属性の上書き用 env が `.env.example` に記載されていることを確認する
  - _Requirements: 4.2_

- [x] 4. 統合・回帰テストによるフロー検証
- [x] 4.1 X 両フローの統合テスト
  - X 通常ログイン（state なし）: コールバックが署名 state 検証を呼ばずにログインへ到達することを検証する（発見 A Flow A 回帰）
  - X 招待登録: 開始 → 登録開始（セッションに招待コード格納）→ コールバックで招待登録に到達することを検証する（発見 A Flow B 回帰）
  - 認証成立時の JWT 発行・リダイレクト挙動が既存と同一であることを確認する
  - _Requirements: 2.2, 2.3, 2.4, 2.6_

- [x] 4.2 他 4 プロバイダの回帰テスト
  - Google・GitHub・LINE・Apple の共通コールバック経路（署名 state 系）が不変であることを検証する
  - X 以外のセッション非依存の挙動が変更されていないことを確認する
  - _Requirements: 1.5_

> **適用外（N/A）**: Requirement 4.4 / 4.5 は `Where Supabase Postgres ベース…` 条件節であり、本設計は Cookie 方式を採用するため適用外。Task 1.1 の互換ゲートが NG となり Option B（connect-pg-simple）へ切替した場合のみ、セッションテーブルの TTL/クリーンアップ（4.4）と `DATABASE_URL`/`DIRECT_URL` 整合（4.5）を実装タスクとして追加する。

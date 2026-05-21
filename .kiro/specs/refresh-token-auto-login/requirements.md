# Requirements Document

## Project Description (Input)

Refresh Token による自動ログイン

## Introduction

現状の Mosaku は JWT アクセストークン（既定 TTL: 24 時間）のみで認証セッションを維持しており、トークン期限切れと同時にユーザーは強制的にログイン画面へ戻される。ドッグフーディング期間中の摩擦としても「翌朝開くと毎回ログインし直し」が継続的に挙がる蓋然性が高く、テーマやノートブックを軸とした「自分のスペース」体験が分断される根本要因になっている。

本機能では Refresh Token を導入し、短命の Access Token と長命の Refresh Token の二段構成にすることで、以下を実現する。

- アプリ起動時に Refresh Token が有効であれば、ユーザー操作なしで自動的に認証セッションを復元する
- Access Token 期限切れ時に、API 呼び出しをユーザーに気づかせずに再試行する（透過的リフレッシュ）
- 失効・ローテーション・盗難検知（reuse detection）をサーバー側で制御し、長期セッションでもセキュリティを確保する
- メール/パスワード認証および全 OAuth プロバイダ（Google / GitHub / LINE / Apple / X）を等しくサポートする

本機能はサーバー状態の真実の源泉である React Query、`apiClient` 経由の統一 API コール、グローバル JWT Guard、`AuthService` / `JwtTokenService` / `OAuthService` の責務分離といった既存アーキテクチャ不変則の上に積み上げる。Refresh Token 自体は Auth ドメインの責務として `JwtTokenService`（あるいはその近傍）に閉じ込め、他ドメインからは見えない形にする。

## Requirements

### Requirement 1: Refresh Token の発行と保管

**Objective:** 認証済みユーザーとして、認証成功時に長命の Refresh Token がサーバー側で安全に管理されるようにしたい。これにより、Access Token が短命でも長期セッションを継続できる。

#### Acceptance Criteria

1. When ユーザーがメール/パスワードでログインに成功した場合, the Auth Service shall 短命の Access Token（既定 15 分）と長命の Refresh Token（既定 30 日）の両方を発行する。
2. When ユーザーが OAuth（Google / GitHub / LINE / Apple / X）コールバック経由でログインに成功した場合, the Auth Service shall メール/パスワード経路と同一仕様で Access Token と Refresh Token を発行する。
3. When ユーザーが招待コードを伴う新規登録（メール／OAuth）に成功した場合, the Auth Service shall 登録直後の自動ログインを実現するために Access Token と Refresh Token を発行する。
4. The Auth Service shall Refresh Token の生平文を DB に永続化せず、暗号学的に安全なハッシュ（または同等の不可逆変換）に変換した値のみを保存する。
5. The Auth Service shall 各 Refresh Token を一意に識別するレコードとして、所有ユーザー ID、発行時刻、失効時刻、状態（active / revoked / rotated）、最終使用時刻、発行元の文脈（IP / User-Agent 等の最低限の監査情報）を保持する。
6. The Auth Service shall Refresh Token の TTL（既定 30 日）を環境変数で設定変更可能にし、コード変更なしで運用調整できるようにする。
7. If Refresh Token の生成・保存いずれかに失敗した場合, the Auth Service shall ログイン操作全体を失敗として扱い、Access Token のみが残る中途半端な状態を生成しない。

### Requirement 2: Access Token の透過的リフレッシュ

**Objective:** 認証済みユーザーとして、Access Token が期限切れになっても操作を中断されたくない。バックグラウンドで自動更新され、APIリクエストが継続成功してほしい。

#### Acceptance Criteria

1. The Auth Service shall `POST /auth/refresh` エンドポイントを提供し、有効な Refresh Token を受け取って新しい Access Token を発行する。
2. When `/auth/refresh` が有効な Refresh Token を受け取った場合, the Auth Service shall 新しい Access Token と新しい Refresh Token を返却し、旧 Refresh Token を `rotated` 状態に遷移させる（ローテーション）。
3. If `/auth/refresh` に失効済み / 不正 / 形式不正な Refresh Token が渡された場合, the Auth Service shall HTTP 401 を返し、現在の Refresh Token を Revoke する。
4. While Access Token が期限切れである場合, the API Client shall 直近のリクエストを保留し、`/auth/refresh` を1回だけ呼び出して新しい Access Token を取得した後に元のリクエストを再送する。
5. When 同時並行する複数 API リクエストが Access Token 期限切れに同時に遭遇した場合, the API Client shall `/auth/refresh` の呼び出しが多重実行されないように単一のリフレッシュ Promise を共有する。
6. If `/auth/refresh` 自体が 401 / ネットワーク不能で失敗した場合, the API Client shall 保留中の全リクエストを失敗させ、ユーザーをログアウト状態に遷移させる。
7. The Auth Service shall `/auth/refresh` を `@Public()` でグローバル JWT Guard の対象外とし、Access Token なしで呼び出せるようにする。

### Requirement 3: アプリ起動時の自動ログイン復元

**Objective:** 一度ログインしたユーザーとして、ブラウザを閉じて翌日開き直しても、ログイン画面に飛ばされずそのまま編集を再開したい。

#### Acceptance Criteria

1. When アプリが初期化される場合, the Frontend Auth Layer shall 保管されている Refresh Token の有無を確認する。
2. When 有効と思われる Refresh Token が存在し Access Token が無い／期限切れの場合, the Frontend Auth Layer shall `/auth/refresh` を呼び出してセッションを復元してからアプリ UI をレンダリングする。
3. While 自動ログイン復元が進行中の場合, the Frontend Auth Layer shall ログイン画面ではなく一時的なロード状態（既存のスプラッシュ／空白を含む）を表示する。
4. If 起動時のリフレッシュが失敗した場合, the Frontend Auth Layer shall 保管されているトークン類を全削除し、ログイン画面へ遷移させる。
5. The Frontend Auth Layer shall 自動ログイン復元の成功／失敗を Sentry の構造化タグ（`feature_area: 'auth'`）でトレース可能にする。

### Requirement 4: 明示的ログアウトと失効

**Objective:** ユーザーとして、ログアウトしたら確実にそのデバイスのセッションが終了し、再利用されないようにしたい。

#### Acceptance Criteria

1. When ユーザーが `/auth/logout` を呼び出した場合, the Auth Service shall そのリクエストに紐付く Refresh Token を `revoked` 状態へ遷移させる。
2. When ユーザーがログアウトを完了した場合, the Frontend Auth Layer shall ローカルに保管された Access Token と Refresh Token の参照値を双方とも削除する。
3. If 既に `revoked` 状態の Refresh Token を `/auth/refresh` で再使用しようとした場合, the Auth Service shall 即座に HTTP 401 を返す。
4. If `rotated` 済み（ローテーション後）の旧 Refresh Token が再使用された場合, the Auth Service shall そのトークン系列（同一ユーザーの当該デバイス系列）を全て Revoke し、reuse 攻撃の疑いとして Sentry に警告イベントを送る。
5. The Auth Service shall パスワード変更が成功したユーザーについて、当該ユーザーの全 Refresh Token を `revoked` 状態へ遷移させる。

### Requirement 5: Refresh Token の保管と伝送

**Objective:** プロダクトオーナーとして、長命の Refresh Token を XSS や CSRF から十分に防御した状態でクライアントに保管したい。

#### Acceptance Criteria

1. The Auth Service shall Refresh Token をクライアントに渡す際、`HttpOnly` 属性付きの Cookie として返却する（既定経路）。
2. The Auth Service shall Refresh Token Cookie に `Secure`（HTTPS のみ）、`SameSite=None`（クロスサブドメイン本番構成のため）、適切な `Path`（`/auth` 等の最小スコープ）を付与する。
3. While 本番環境（フロント: Vercel `mosaku.jp` ／バック: Cloud Run）でクロスオリジン構成にある場合, the Auth Service shall CORS 設定で `credentials: true` を許可し、Cookie 同送リクエストを成立させる。
4. The Frontend Auth Layer shall Refresh Token 文字列そのものを JavaScript からアクセス可能な保管領域（localStorage / sessionStorage / memory 変数 など）に格納しない。
5. The Frontend API Client shall `/auth/refresh` を呼び出す際、`credentials: 'include'` 相当の設定で Cookie が自動同送されるようにする。
6. Where 開発環境（ローカル）で Cookie ドメインが本番と異なる場合, the Auth Service shall 開発用ドメインに対しても Refresh Token Cookie が正しく付与されるよう環境変数（例: `REFRESH_COOKIE_DOMAIN` / `REFRESH_COOKIE_SAMESITE`）で挙動を切り替え可能にする。

### Requirement 6: Access Token の短命化と既存運用との互換性

**Objective:** プロダクトオーナーとして、Refresh Token 導入と同時に Access Token を短命化したい。これにより、Access Token 漏洩時の被害ウィンドウを最小化する。

#### Acceptance Criteria

1. The Auth Service shall Access Token の既定 TTL を 15 分に変更し、環境変数（例: `JWT_EXPIRATION`）でオーバーライド可能にする。
2. The Auth Service shall 既存のグローバル JWT Guard + `@Public()` opt-out の挙動を変更せず、Access Token の検証ロジックを既存の `JwtStrategy` に維持する。
3. While 本機能リリース直後の旧 Access Token（TTL 24h）が残っている場合, the Auth Service shall その Access Token を仕様どおり exp まで有効として受理する（移行期間中の互換性）。
4. The Frontend API Client shall 旧版互換のためにレスポンスから Access Token が返却された場合は従来通り localStorage に保持し、Refresh Token はサーバー側 Cookie 経由でのみ管理する責務を維持する。

### Requirement 7: 観測性とエラーハンドリング

**Objective:** プロダクトオーナーとして、Refresh Token 関連の挙動を Sentry で追跡し、回帰や不正利用兆候を検知したい。

#### Acceptance Criteria

1. The Auth Service shall `/auth/refresh` の成功／失敗、reuse 検知、明示的 revoke を全て Sentry に `feature_area: 'auth'` タグで送出する。
2. The Auth Service shall Sentry に送信するイベントから Refresh Token 平文・ハッシュ・JWT 本体を除外する（既存 PII スクラバ規約に従う）。
3. If 同一ユーザーで `/auth/refresh` が短時間に大量失敗する場合, the Auth Service shall `@nestjs/throttler` で適切に制限し、429 を返す。
4. The Auth Service shall Refresh Token 関連エラーを既存の `ERROR_CODES.AUTH.*` 体系に追加し、フロントが文言を出し分けられるエラーコードを返却する（例: `AUTH.REFRESH_TOKEN_EXPIRED`, `AUTH.REFRESH_TOKEN_REUSED`）。
5. The Frontend API Client shall リフレッシュ失敗時のログアウト遷移を Sentry breadcrumb として記録し、ユーザー操作との因果関係を追跡可能にする。

### Requirement 8: テスト容易性と段階導入

**Objective:** 開発者として、Refresh Token 機構を既存の TDD ワークフロー（RED → GREEN → REFACTOR）で安全に開発・回帰防止したい。

#### Acceptance Criteria

1. The Auth Service shall Refresh Token の発行・検証・ローテーション・revoke ・reuse 検知の各分岐を Jest 単体テストで検証可能な純関数 or サービスメソッドとして公開する。
2. The Frontend API Client shall 透過的リフレッシュ・並行リクエスト集約・失敗時ログアウトの挙動を Vitest で検証可能な構造（モックサーバーや差し替え可能な fetch 層）で実装する。
3. The Auth Service shall 既存の `auth.controller.spec.ts` / `jwt.service.spec.ts` / `oauth.service.spec.ts` の互換性を維持し、影響範囲のテストが追加されるまでは既存テストが落ちないようにする。
4. The Auth Service shall E2E テスト（Supertest）でログイン → `/auth/refresh` → 期限切れ Access Token での通常 API 呼び出し → 自動更新 のシナリオを再現可能にする。
5. Where ドッグフーディング期間中の本番運用にある場合, the Auth Service shall Refresh Token 機構を本番フラグなし（常時 ON）でデプロイし、機構自体に隠しスイッチを設けない（運用複雑性の増加を避ける）。

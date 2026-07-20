# Requirements Document

## Project Description (Input)

現在5つあるOAuthログインプロバイダ（Google / X / Apple / LINE / GitHub）を、日本市場の利用実態とMosakuの集客戦略（Xでの営業）を踏まえ Google / X / Apple の3つに削減する。LINE と GitHub のログインを廃止する。

背景・根拠: X=集客チャネルなので確定。Google=全方位アンカー（誰でも保有）。Apple=日本のiPhone率約54%かつX創作クラスタと相性が良く、将来のネイティブiOSアプリ審査(App Store Guideline 4.8)でも必須になり得る。LINEは国内MAU最大だが独立系ノートアプリのログイン手段としては旨みが薄い。GitHubは開発者向けで一般ユーザーの利用がほぼ無い。

スコープ: ログイン画面からLINE/GitHubボタンを撤去。/auth/line・/auth/github の各エンドポイントとPassport Strategy・関連OAuthServiceメソッド・環境変数(LINE*CLIENT*_/GITHUB*CLIENT*_)を廃止。docs と .env.example を更新。残るGoogle/X/Appleのログインは回帰なく動作させ、既存テストは緑を維持する。XはPassport撤去済みのステートレスPKCE(oauth-stateless-unification)で実装済み。

実装前に潰す重要な制約が2点:

1. Userモデルに githubId 列が無く、GitHubは oauthId を共用している可能性がある → Google との識別子衝突が起きないか確認し、Googleユーザーのログインに影響しないことを保証する。
2. 既存の LINE/GitHub 登録ユーザーを締め出さない。全Userは email 必須(unique)のため、他プロバイダ(Google/X/Apple)または パスワードリセット経由で継続アクセスできる移行動線を保証する。lineId 等の既存データは破壊的に削除しない。

---

## Introduction

Mosakuは現在サポートするOAuthプロバイダ（Google / X / Apple / LINE / GitHub）を **Google / X / Apple の3つに削減** する。LINE と GitHub のログイン経路を廃止し、UI・エンドポイント・設定・ドキュメントを有効プロバイダに整合させる。全ユーザーが一意なメールアドレスを保持しているため、廃止プロバイダで登録した既存ユーザーもメール経由で継続アクセスできることを保証する。既存データ（lineId 等）は破壊的に削除せず、残るGoogle/X/Appleのログインは無回帰で維持する。

---

## Requirements

### Requirement 1: ログイン画面のプロバイダ削減

**Objective:** ユーザーとして、ログイン画面で有効なプロバイダ（Google / X / Apple）だけを見たい。そうすることで、廃止されたLINE/GitHubを誤って選ばずに済む。

#### Acceptance Criteria

1. When ユーザーがログイン画面を開いたとき、the Auth System shall Google・X・Appleのログインボタンのみを表示する
2. The Auth System shall LINE・GitHubのログインボタンを表示しない
3. Where 招待画面・登録画面など複数のログイン導線が存在する場合、the Auth System shall いずれの導線でも表示プロバイダをGoogle・X・Appleに統一する

---

### Requirement 2: LINE / GitHub OAuthエンドポイントの廃止

**Objective:** システムとして、LINE/GitHubのOAuth認証経路を廃止したい。そうすることで、廃止プロバイダ経由の新規認証を停止し、保守・攻撃面を縮小できる。

#### Acceptance Criteria

1. If クライアントが `/auth/line`・`/auth/line/callback`・`/auth/github`・`/auth/github/callback` にアクセスしたとき、the Auth System shall 認証を開始せず、無効化を示す応答（404 または認証失敗URLへのリダイレクト）を返す
2. The Auth System shall LINE・GitHub の Passport Strategy / Guard / OAuthServiceメソッド（lineLogin・githubLogin 等）を保持しない
3. When LINE*CLIENT*_ / GITHUB*CLIENT*_ 環境変数が未設定のとき、the Auth System shall 残プロバイダに影響を与えず正常に起動する

---

### Requirement 3: 既存 LINE / GitHub ユーザーの継続アクセス保証（移行）

**Objective:** LINE/GitHubで登録した既存ユーザーとして、プロバイダ廃止後もアカウントとデータにアクセスし続けたい。そうすることで、締め出されずMosakuを使い続けられる。

#### Acceptance Criteria

1. The Auth System shall 全ユーザーが保持する一意なメールアドレスを、廃止プロバイダ利用者の本人識別の基点として利用する
2. When LINE/GitHubのみで登録した既存ユーザーが同一メールのGoogle・X・Appleでログインしたとき、the Auth System shall 既存アカウント（メモ・ノートブック等のデータ）に紐付けてアクセスを許可する
3. Where 他プロバイダを利用できない既存ユーザーがいる場合、the Auth System shall パスワードリセット（メール経由）による継続アクセス手段を提供する
4. **[Non-Goal / Descoped]** ~~The Auth System shall 廃止対象ユーザーへ代替ログイン方法を告知する（ログイン画面またはメール）~~
   能動的告知（常設バナー／メール通知）は実装しない。全 User が email 必須(unique)で、他プロバイダ（Google/X/Apple）ログインまたはパスワード再設定により**永久ロックアウトは構造的に起きない**ため、継続アクセスは 3.1〜3.3 で担保する。descope は design.md「Non-Goals」で確定（人間承認済み・`/kiro:validate-design` 2026-07-19）。

---

### Requirement 4: アカウント識別子の健全性（githubId / oauthId 調査）

**Objective:** システムとして、GitHub廃止時のアカウント識別子の扱いを明確にしたい。そうすることで、Googleユーザーとの取り違えやログイン不能を防げる。

#### Acceptance Criteria

1. The Auth System shall GitHub認証が使用していた識別子カラム（`oauthId` 共用か専用カラムか）を確定し文書化する
2. If GitHubがGoogleと同一の `oauthId` カラムを共用している場合、the Auth System shall Googleユーザーの識別・ログインに影響が出ないことを検証する
3. The Auth System shall 残プロバイダ（Google / X / Apple）の識別子（oauthId・xId・appleId）に対する一意制約を維持する

---

### Requirement 5: データ保全（非破壊的な廃止）

**Objective:** システムとして、廃止プロバイダの既存データを破壊せずに廃止したい。そうすることで、監査・復旧・将来の再有効化に備えられる。

#### Acceptance Criteria

1. The Auth System shall `lineId` 等の既存カラムおよび格納済みデータを、破壊的マイグレーションで削除しない
2. Where スキーマ整理を行う場合、the Auth System shall データ喪失を伴わない方法（カラム保持またはアーカイブ）を採用する

---

### Requirement 6: 残プロバイダの無回帰とドキュメント整合

**Objective:** 開発者として、削減後もGoogle/X/Appleログインが壊れず、設定・文書が実態と一致していることを保証したい。そうすることで、安全にリリースできる。

#### Acceptance Criteria

1. When 削減を適用した後、the Auth System shall Google・X・Appleのログイン／新規登録フローを従来どおり成功させる
2. The Auth System shall 既存の自動テストスイートを全て緑に維持する（廃止プロバイダ関連テストは削除または更新する）
3. The Auth System shall `.env.example` および OAuthセットアップ／デプロイ関連ドキュメント（oauth-setup.md・vercel.md・cloud-run.md 等）から LINE/GitHub 記述を削除し、有効プロバイダ3種に更新する
4. The Auth System shall CLAUDE.md の環境変数リスト（`{GOOGLE,GITHUB,LINE,APPLE,X}_CLIENT_*`）を有効プロバイダに合わせて更新する

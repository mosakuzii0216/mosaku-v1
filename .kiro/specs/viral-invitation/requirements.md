# Requirements Document

## Project Description (Input)

口コミ拡散を目的とした招待ユーザー登録UXの再設計。既存ユーザーが招待枠（invitationQuota）を持ち、短い招待URL（/invite/{code}、nanoid 8文字程度）を友達にシェアできる。受信者は URL prefill された登録画面で「○○さんから招待されました」の文脈を見ながら、Google/GitHub/LINE/Apple/X いずれかのOAuth または メール/パスワードで登録できる。OAuth は事前に招待コードを検証してから開始し、「Google同意後に弾かれる」事故を防ぐ。Settings画面に「友達を招待」UI を追加し、Web Share API でネイティブ共有できる。機能名: viral-invitation。スコープ外（別specで対応）: メール認証フロー、ウェイトリスト、招待実績ダッシュボード、招待ランキング/報酬。

## Introduction

Mosakuは招待制のメモアプリで、口コミによる小規模コミュニティ拡散を目的としている。現状の招待ユーザー登録フローには以下の体験上の課題がある:

- 32文字大文字hexの招待コードを手入力する負担が大きく、SNSや口頭での共有が困難
- OAuth プロバイダの同意取得**後**に招待コード必須を通知するため、新規ユーザーが Google 等の認可を許可した時点でゼロ価値離脱する
- 招待者の文脈（誰から招待されたのか）が表示されず、信頼性の動機付けが弱い
- 一般ユーザーが他者を招待する UI が存在せず、管理者のみが招待コードを発行できる
- バックエンドのエラー分岐がエラーメッセージ文字列マッチに依存しており、文言変更で容易にデグレが発生する

本仕様では、上記課題を解消する招待登録 UX の再設計を行う。受信者が招待URLを踏むだけで prefill された登録画面に到達し、招待者の文脈を確認した上でOAuthまたはメール登録を完了できる状態を目指す。既存ユーザーには「招待枠（invitationQuota）」を付与し、Settings 画面から Web Share API でリンクを共有できる UI を追加する。スコープ外: メール認証フロー、ウェイトリスト、招待実績ダッシュボード、招待ランキング/報酬は別仕様で扱う。

## Requirements

### Requirement 1: 招待URLによる prefill 登録導線

**Objective:** 招待された未登録ユーザーとして、招待URL を踏むだけで招待コードが入力済みの登録画面に到達したい。手入力の負担なく招待者の文脈を確認して登録を始められるようにするため。

#### Acceptance Criteria

1. The 招待登録サービス shall `/invite/:code` 形式のルートを公開し、未認証ユーザーがアクセスすると登録画面に遷移させる
2. When 未認証ユーザーが `/invite/:code` にアクセスし `code` が有効、the 招待登録サービス shall 招待コードを入力済み状態で登録画面を表示し、招待者の表示名を画面上に表示する
3. If `/invite/:code` の `code` が無効・期限切れ・使用上限到達、the 招待登録サービス shall それぞれを区別したエラーメッセージを表示し、招待コードなしのトップへの導線を提供する
4. When 既に認証済みのユーザーが `/invite/:code` にアクセス、the 招待登録サービス shall 登録画面に遷移させずアプリのホームへリダイレクトする
5. Where 招待コードが prefill されている場合、the 招待登録サービス shall 入力欄を編集可能のまま残し、ユーザーが別コードに差し替えられるようにする

### Requirement 2: 招待コードの可読性と短縮

**Objective:** 招待者として、SNS や口頭で気軽に共有できる短く読みやすい招待コードを発行したい。共有時のURL長を抑え、誤入力を減らすため。

#### Acceptance Criteria

1. The 招待管理サービス shall 新規に発行する招待コードを nanoid ベースの 8〜10 文字に統一し、URLセーフな英数字のみで構成する
2. The 招待管理サービス shall 新規発行コードに視認性の低い文字（紛らわしい `0/O`, `1/l/I` 等）を含めない文字集合を使用する
3. While 既存の 32 文字 hex コードが DB に残っている間、the 招待管理サービス shall 旧コードでの検証・登録を受け付け、後方互換性を保つ
4. The 招待登録サービス shall 招待コード入力欄に `autoCapitalize="off"` `autoComplete="off"` `inputMode="text"` `spellCheck={false}` を設定し、モバイルでの誤入力を抑制する
5. When 招待コードが発行される、the 招待管理サービス shall 共有用の絶対URL（`{FRONTEND_URL}/invite/{code}` 形式）も同時にレスポンスに含める

### Requirement 3: OAuth登録順序の逆転

**Objective:** 招待された未登録ユーザーとして、OAuth プロバイダの認可画面に進む**前**に招待コードの有効性を確認したい。「Google で同意したのに招待コードが無効で登録できない」というゼロ価値離脱事故を防ぐため。

#### Acceptance Criteria

1. When ユーザーが `/invite/:code` 経由で登録画面に到達し OAuth ボタンを押下、the 招待登録サービス shall OAuth 認可フロー開始前に招待コードのサーバ検証を実行する
2. If 招待コードのサーバ検証が失敗、the 招待登録サービス shall OAuth プロバイダへリダイレクトせず、画面上にエラー理由を表示する
3. When 招待コードのサーバ検証が成功、the 招待登録サービス shall OAuth 認可フローを開始し、招待コードを state パラメータまたは安全なサーバ側セッションを通じて OAuth コールバックまで引き継ぐ
4. When OAuth コールバックを受信、the 招待登録サービス shall 引き継いだ招待コードを再検証した上で新規ユーザー作成と招待コード消費（`useInvitation`）を実行する
5. The 招待登録サービス shall 「OAuth 認可後に招待コード未所持で弾かれた未登録ユーザー」が発生しない状態を保証する
6. If 旧フロー（OAuth 認可後にエラーから招待コード入力画面に戻る経路）が残存する場合、the 招待登録サービス shall 当該経路を廃止または無効化し、新フローへ統一する

### Requirement 4: ユーザーごとの招待枠（invitationQuota）

**Objective:** 既存ユーザーとして、自分が保有する N 枚の招待枠を使って友達に招待リンクを発行したい。管理者を介さずに口コミで広げられるようにするため。

#### Acceptance Criteria

1. The 招待管理サービス shall `User` モデルに `invitationQuota`（整数、デフォルト値はプロジェクト計画で別途決定）を追加し、ユーザーごとの保有枠を表現する
2. When 既存ユーザーへのマイグレーションが実行される、the 招待管理サービス shall 既存全ユーザーに初期 quota を一律付与する
3. When 一般ユーザーが招待コード発行 API を呼び出し `invitationQuota` が 1 以上、the 招待管理サービス shall 招待コードを 1 件発行し `invitationQuota` を 1 減算する
4. If 一般ユーザーの `invitationQuota` が 0 の状態で招待コード発行 API が呼ばれる、the 招待管理サービス shall 発行を拒否し、枠不足を示すエラーコードを返す
5. While ユーザーが ADMIN ロール、the 招待管理サービス shall `invitationQuota` の減算を行わず、無制限に招待コードを発行できる
6. The 招待管理サービス shall ユーザーが自身の `invitationQuota` 残数と発行済み招待コード一覧を取得できる API を提供する
7. The 招待管理サービス shall 一般ユーザーが他ユーザーの招待コード・残数を取得できないよう所有権チェックを `AuthorizationService.checkOwnership()` 経由で実施する

### Requirement 5: 友達招待UI（Web Share API 対応）

**Objective:** 既存ユーザーとして、Settings 画面から数タップで友達に招待リンクを共有したい。スマートフォン上でネイティブ共有シートを使えるようにすることで、口コミ拡散の摩擦を最小化するため。

#### Acceptance Criteria

1. The Settings画面 shall 「友達を招待」セクションを表示し、現在の `invitationQuota` 残数を可視化する
2. When ユーザーが「招待リンクを発行」操作を実行、the Settings画面 shall 新規招待コードを生成して招待URLを表示する
3. Where ブラウザが Web Share API をサポートしている場合、the Settings画面 shall ネイティブ共有シートを開く「共有」ボタンを表示する
4. If ブラウザが Web Share API を未サポート、the Settings画面 shall クリップボードコピー操作にフォールバックする「URLをコピー」ボタンを表示する
5. The Settings画面 shall 発行済み招待コード一覧を表示し、各コードの使用状況（`usedCount` / `maxUses`）と発行日を可視化する
6. While `invitationQuota` 残数が 0 かつ ユーザーが ADMIN でない、the Settings画面 shall 「招待リンクを発行」操作を無効化し、残数 0 である旨を表示する

### Requirement 6: 招待者の文脈表示

**Objective:** 招待された未登録ユーザーとして、登録画面で「誰から招待されたのか」を確認したい。知人からの招待だと認知することで信頼して登録に進めるようにするため。

#### Acceptance Criteria

1. When `/invite/:code` 経由で登録画面に到達、the 招待登録サービス shall 招待コード発行者（`InvitationCode.createdById`）の表示名を画面上に表示する
2. The 招待管理サービス shall 招待コード検証 API のレスポンスに招待者の `name`（およびマスクされた識別子）を含め、メールアドレス等の機微情報は含めない
3. If 招待者の `name` が未設定（null）、the 招待登録サービス shall 「あるユーザーから招待されました」等の汎用文言にフォールバックする
4. The 招待管理サービス shall 招待者情報レスポンスに招待者の `email` を含めず、Sentry スクラバ規約（PIIポリシー）と整合させる

### Requirement 7: エラーコードによる構造化失敗ハンドリング

**Objective:** フロントエンド開発者およびエンドユーザーとして、招待コードの失敗理由（無効・期限切れ・使用上限・枠不足）を区別して理解したい。文字列マッチに依存しない堅牢な分岐を実現するため。

#### Acceptance Criteria

1. The 招待登録サービス shall 招待コードの失敗理由（`INVALID_CODE` / `EXPIRED` / `MAX_USES_REACHED` / `QUOTA_EXHAUSTED`）を `ERROR_CODES` 体系の構造化エラーコードとして返す
2. The 招待登録サービス shall フロントエンドのエラー分岐をエラーメッセージ文字列の `includes` マッチではなくエラーコードでの判定に統一する
3. When 招待コード検証エラーが発生、the 招待登録サービス shall 各エラーコードに対応した日本語メッセージを画面に表示する
4. The 招待登録サービス shall 既存の文字列マッチ判定（`errorMessage.includes('invitation code')` 等）を撤去し、Sentry `feature_area: invitation` タグで失敗イベントを記録する

### Requirement 8: 登録完了後の自動ログインと表示の整合

**Objective:** 招待登録を完了したユーザーとして、登録成功後にそのままアプリの利用を開始したい。「登録成功しました」と表示されながら追加でログインを求められる混乱を防ぐため。

#### Acceptance Criteria

1. When 招待登録（メール/パスワード または OAuth）が成功、the 招待登録サービス shall アクセストークン発行と refresh cookie 設定を行い、ユーザーをログイン済み状態にする
2. When 登録成功後の画面表示を行う、the 招待登録サービス shall 「再ログインを促す文言」を表示せず、アプリのホーム画面または初回オンボーディング画面に遷移させる
3. While 既存の「Registration successful! You can now login with your credentials.」等の自動ログインと矛盾する文言が存在する、the 招待登録サービス shall 当該文言を削除または整合する文言に置換する

### Requirement 9: 既存フローと管理者例外の整合

**Objective:** プロダクトオーナーとして、現行の管理者メール例外（`isAdminEmail()` 該当者は招待コードなしで登録可能）と OAuth プロバイダ別の登録経路を、新フローと整合させたい。既存挙動を意図せず破壊しないため。

#### Acceptance Criteria

1. The 招待登録サービス shall 既存の管理者メール例外（招待コードなし登録）を維持し、メール/パスワード・OAuth いずれの経路でも従来通り機能させる
2. The 招待登録サービス shall Google / GitHub / LINE / Apple / X の 5 プロバイダ全てで Requirement 3 の OAuth 順序逆転を適用する
3. The 招待管理サービス shall 既存の「通常コード（maxUses=1）」「キャンペーンコード（maxUses=N）」の 2 種類の区別を維持し、ユーザー quota から発行されるコードは「通常コード」として扱う
4. When マイグレーション実行時に既存ユーザーへ初期 quota を付与、the 招待管理サービス shall 既存ユーザーの ADMIN/USER ロールを尊重し、ADMIN ロールには quota 加算を行わない（ADMIN は無制限のため）

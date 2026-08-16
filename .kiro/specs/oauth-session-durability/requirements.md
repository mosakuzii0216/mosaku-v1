# Requirements Document

## Project Description (Input)

X OAuth のセッションを永続化して Cloud Run 複数インスタンスでも安定させる。

【背景】backend の main.ts の express-session がストア未指定＝デフォルト MemoryStore。Google/GitHub/LINE/Apple は InvitationStateService の署名付き state（HMAC）でステートレスだが、X のみ x.strategy.ts:35 で state:true を使い、CSRF state と PKCE code_verifier を session に保存する。本番 Cloud Run は複数インスタンス/再起動が前提のため、ログイン開始と OAuth コールバックが別インスタンスに当たると session が見つからず X ログインが失敗する。加えてデフォルト MemoryStore は本番でメモリリーク源（公式に非推奨）。

【ギャップ分析で判明した実態（重要）】X OAuth は複数インスタンス以前に、現状**両フローとも成立していない**（詳細は gap-analysis.md §3.5 発見 A）。

- Flow A（既存ログイン `/auth/x`→passport）: passport は単一インスタンスなら成功するが、その直後に controller `runOAuthCallbackWithStateSupport` が passport のランダム CSRF state を招待署名 state と誤認し `verifyState` が必ず throw → `invalid_state` リダイレクトで失敗。
- Flow B（招待登録 `POST /auth/oauth/x/start`）: `generateOAuthAuthorizationUrl('x')` がダミー PKCE（`code_challenge:'challenge'`/`plain`）を発行し、かつ start が passport を経由しないため、callback で XAuthGuard が空 session を参照して 401。
- 根本原因: X だけ passport が state を所有する（`state:true`）のに、controller は「passport は state を所有しない」前提で書かれている設計矛盾。

【ゴール】セッションストアを全インスタンス共有可能な永続化方式（第一候補: 署名付き Cookie ベース＝サーバーストア不要、次点: 既存 Supabase Postgres を使う connect-pg-simple）に置き換え、**かつ上記の X 経路不整合（controller の二重 state 解釈・ダミー PKCE）を解消して**、X OAuth が複数インスタンス環境でも確実に成立するようにする。X 以外のプロバイダ挙動は不変。

【方針（gap-analysis で確定: 案 b）】X は passport 経路（`state:true/pkce:true` の session 方式）に一本化する。(1) controller が passport の CSRF state と招待署名 state を構造で判別して誤認をやめる、(2) 招待登録の X は招待コードを session 経由で往復させる、(3) ダミー PKCE の start 経路は撤去または作り直す。session ストアの共有化（上記ゴール）と併せて多インスタンス耐性を確保する。

【非機能・制約】Cookie 方式の場合は secure/httpOnly/sameSite を本番で適切に設定し、ペイロード（state + PKCE verifier）がサイズ上限に収まること。Postgres 方式の場合は session テーブルの TTL/クリーンアップを設計。session secret は環境変数化し .env.example に追記。既存の helmet / CORS / cookie-parser 設定および本番のクロスオリジン（mosaku.jp ↔ api.mosaku.jp）構成と整合させる。

【対象外】X 以外のプロバイダのフロー変更、OAuth を完全 stateless 化する大規模リファクタ（5 社統一＋PKCE verifier の署名 state 移植＝案 a。将来の別 spec で検討）。

## Requirements

### Requirement 1: 全インスタンス共有可能なセッション永続化

**Objective:** 運用者として、セッションストアを全 Cloud Run インスタンスで共有可能な永続化方式にしたい。これにより、複数インスタンス・再起動を前提とする本番環境でも OAuth セッションが消失せず、デフォルト MemoryStore のメモリリークも排除できる。

#### Acceptance Criteria

1. The Auth Session Store shall デフォルトの express-session MemoryStore を使用せず、全インスタンスから参照可能な永続化バックエンド（署名付き Cookie ベース、または Supabase Postgres ベース）を使用する。
2. When 起動時にセッションストアを初期化する, the Auth Session Store shall 設定された永続化バックエンドを使ってセッションミドルウェアを構成する。
3. While 本番環境（`isProduction` が真）で動作している, the Auth Session Store shall MemoryStore へのフォールバックを行わず、永続化バックエンド未構成の場合は起動時に検知可能なエラーまたは警告ログを出力する。
4. When ログイン開始を処理したインスタンスとは別のインスタンスが同一セッションのデータを参照する, the Auth Session Store shall 当該セッションに保存された値を解決できる。
5. The Auth Session Store shall X 以外のプロバイダ（Google・GitHub・LINE・Apple）の認証フローおよびその他のセッション非依存の挙動を変更しない。

### Requirement 2: X OAuth の成立と複数インスタンス耐性

**Objective:** X でログインするユーザーとして、X ログイン自体が確実に成立し、かつログイン開始とコールバックが別々の Cloud Run インスタンスに到達しても成功してほしい。これにより、現状成立していない X ログインを成立させ、複数インスタンス起因の失敗もなくす。

#### Acceptance Criteria

1. When ユーザーが X ログインを開始する, the X OAuth Flow shall CSRF state と PKCE code_verifier を全インスタンス共有可能な永続化方式で保存する。
2. When X からのコールバックがログイン開始時とは別のインスタンスに到達する, the X OAuth Flow shall 保存済みの CSRF state と PKCE code_verifier を解決し、認証を継続する。
3. When X の正規コールバックが到達する, the X OAuth Callback Handler shall passport が発行した CSRF state を招待署名 state と区別し、正規フローを誤って拒否しない。
4. When 招待コード経由で X 登録を開始する, the X OAuth Flow shall 招待コードを全インスタンス共有可能な方式で引き継ぎ、コールバック時に解決して登録に用いる。
5. If コールバック時に CSRF state が一致しない、または保存値が見つからない, then the X OAuth Flow shall 認証を拒否し、ユーザーをエラーとして扱う。
6. When X 認証が成立する, the X OAuth Flow shall 既存と同一のユーザー識別・JWT 発行・リダイレクト挙動を維持する。
7. While X OAuth プロバイダが未構成（Client ID/Secret が空）, the X OAuth Flow shall 既存どおり警告ログを出して起動を継続し、X ログイン要求に対して構成不備を示す応答を返す。

### Requirement 3: セキュリティ設定とクロスオリジン構成の整合

**Objective:** セキュリティ担当として、セッション Cookie 属性と既存のセキュリティ構成（helmet / CORS / cookie-parser / クロスオリジン）を整合させたい。これにより、mosaku.jp ↔ api.mosaku.jp のクロスオリジン構成でも X OAuth が安全かつ確実に動作する。

#### Acceptance Criteria

1. While 本番環境で動作している, the Auth Session Store shall セッション Cookie に `secure: true` と `httpOnly: true` を設定する。
2. The Auth Session Store shall 本番のクロスオリジン構成（mosaku.jp ↔ api.mosaku.jp）と OAuth リダイレクトが成立するよう、セッション Cookie の `sameSite` 属性を適切に設定する。
3. The Auth Session Store shall 既存の helmet（CSP 含む）・CORS（`credentials: true`）・cookie-parser 設定と矛盾しない構成を維持する。
4. Where 署名付き Cookie ベースの永続化方式を採用する, the Auth Session Store shall ペイロード（CSRF state + PKCE code_verifier）がブラウザの Cookie サイズ上限内に収まることを保証する。
5. The Auth Session Store shall セッション Cookie の有効期間を OAuth フロー完了に十分かつ過度に長くない範囲に設定する。

### Requirement 4: セッション機密情報の構成管理と運用

**Objective:** 運用者として、セッション秘密鍵を環境変数で管理し、永続化ストアの寿命を適切に運用したい。これにより、機密のハードコードを避け、ストアの肥大化を防ぐ。

#### Acceptance Criteria

1. The Auth Session Store shall セッション署名・暗号化に用いる秘密鍵を環境変数から取得し、コードにハードコードしない。
2. The Project Configuration shall セッション秘密鍵および永続化方式に必要な環境変数を `.env.example` に記載する。
3. If セッション秘密鍵が未設定のまま本番環境で起動する, then the Auth Session Store shall 起動時に検知可能なエラーまたは警告を出力する。
4. Where Supabase Postgres ベースの永続化方式を採用する, the Auth Session Store shall セッションテーブルの TTL と期限切れレコードのクリーンアップ方式を備える。
5. Where Supabase Postgres ベースの永続化方式を採用する, the Auth Session Store shall 既存の `DATABASE_URL`（プーリング）/ `DIRECT_URL`（直接接続）の接続方針と整合する接続を用いる。

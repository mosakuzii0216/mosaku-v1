# Requirements Document

## Project Description (Input)

X OAuth のセッションを永続化して Cloud Run 複数インスタンスでも安定させる。

【背景】backend の main.ts の express-session がストア未指定＝デフォルト MemoryStore。Google/GitHub/LINE/Apple は InvitationStateService の署名付き state（HMAC）でステートレスだが、X のみ x.strategy.ts:35 で state:true を使い、CSRF state と PKCE code_verifier を session に保存する。本番 Cloud Run は複数インスタンス/再起動が前提のため、ログイン開始と OAuth コールバックが別インスタンスに当たると session が見つからず X ログインが散発的に失敗する。加えてデフォルト MemoryStore は本番でメモリリーク源（公式に非推奨）。

【ゴール】セッションストアを全インスタンス共有可能な永続化方式（第一候補: 署名付き Cookie ベース＝サーバーストア不要、次点: 既存 Supabase Postgres を使う connect-pg-simple）に置き換え、X OAuth が複数インスタンス環境でも確実に成立するようにする。X 以外のプロバイダ挙動は不変。

【非機能・制約】Cookie 方式の場合は secure/httpOnly/sameSite を本番で適切に設定し、ペイロード（state + PKCE verifier）がサイズ上限に収まること。Postgres 方式の場合は session テーブルの TTL/クリーンアップを設計。session secret は環境変数化し .env.example に追記。既存の helmet / CORS / cookie-parser 設定および本番のクロスオリジン（mosaku.jp ↔ api.mosaku.jp）構成と整合させる。

【対象外】X 以外のプロバイダのフロー変更、OAuth を完全 stateless 化する大規模リファクタ（PKCE verifier の署名 state 移植。将来の別 spec で検討）。

## Requirements

<!-- Will be generated in /kiro:spec-requirements phase -->

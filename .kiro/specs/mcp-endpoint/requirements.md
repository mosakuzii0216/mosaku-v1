# Requirements Document

## Project Description (Input)

mosaku MCP エンドポイント（v1）。mosaku を「AIの外付け脳みそ（長期記憶）」にするリモート MCP サーバーを backend(NestJS/Cloud Run) に実装する。Claude Code を本命クライアントに、Claude スマホ/claude.ai もカバー（Gemini は対象外）。接続方式は Streamable HTTP + OAuth 2.1 で、既存の JWT+OAuth 基盤に乗せる。v1 で公開する tools は2つ: create_memo(content, notebook?)=壁打ち結果を新規メモとして保存(write)、search_memos(query)=過去メモをキーワード検索して文脈に使う(read)。所有権は AuthorizationService.validateOwnership() で担保。サーバー側実装のためサービス直呼び（apiClient 経由ではない）。背景・意思決定の経緯は .kiro/steering/20260615-mcp-endpoint/brainstorm.md を参照。重要: MCP は壁打ちするユーザー自身のAIがトークン代を払うため mosaku 側は変動コストほぼゼロ＝従量課金不要でサブスク込み/定額提供できる（monetization.md の従量モデルとは別枠）。

## Introduction

本仕様は、mosaku を「AIの外付け脳みそ（長期記憶）」にするためのリモート MCP（Model Context Protocol）サーバーを backend（NestJS / Cloud Run）に追加するものである。Claude Code 等の MCP クライアントが、ユーザーとの壁打ち結果を mosaku に自動保存（write）し、過去メモを検索して文脈に取り込む（read）ことで、「書く行為」を消しつつメモを資産として蓄積させる。

v1 のスコープは、Streamable HTTP トランスポート + OAuth 2.1 認可で接続できる MCP サーバーと、2 つの公開 tool（`create_memo` / `search_memos`）に限定する。所有権境界は既存の `AuthorizationService.validateOwnership()` で担保し、サーバー側実装のため既存サービス（memo / notebook 等）を直接呼び出す（フロントエンドの `apiClient` は経由しない）。

トークン代を負担するのは壁打ちするユーザー自身の AI クライアントであり、mosaku 側の変動コストはほぼゼロであるため、本機能は従量課金ではなく定額（サブスク込み）で提供できる前提とする。

**スコープ外（v1）**: `append_to_memo` / `get_memo` / `list_notebooks` 等の追加 tool（v2 候補）、Gemini クライアント対応、メモの更新・削除系 tool。

## Requirements

### Requirement 1: MCP サーバーエンドポイント（Streamable HTTP）

**Objective:** MCP クライアントを使うユーザーとして、mosaku に MCP 経由で接続したい。そうすれば普段使う AI から mosaku を「道具」として呼び出せる。

#### Acceptance Criteria

1. The MCP サーバー shall MCP 仕様に準拠した Streamable HTTP トランスポートのエンドポイントを backend 上に公開する。
2. When MCP クライアントが `initialize` リクエストを送信したとき, the MCP サーバー shall サーバー情報とサポートする capability を含む初期化レスポンスを返す。
3. When MCP クライアントが `tools/list` を要求したとき, the MCP サーバー shall v1 で公開する tool（`create_memo` / `search_memos`）の名前・説明・入力スキーマを返す。
4. When MCP クライアントが未対応のメソッドまたは未知の tool を要求したとき, the MCP サーバー shall MCP 仕様に準拠したエラーレスポンスを返す。
5. The MCP サーバー shall Claude Code（`claude mcp add --transport http <url>`）および Claude スマホ / claude.ai の Custom Connector から接続可能である。
6. The MCP サーバー shall 既存の API ルートおよびグローバル JWT Guard 構成と共存し、既存エンドポイントの認証・挙動に影響を与えない。

### Requirement 2: OAuth 2.1 による接続認可

**Objective:** mosaku ユーザーとして、自分のアカウントで MCP クライアントを安全に認可したい。そうすれば他人のメモにアクセスされる心配なく接続できる。

#### Acceptance Criteria

1. The MCP サーバー shall MCP 仕様に準拠した OAuth 2.1 認可フローで保護され、未認可のリクエストを拒否する。
2. If アクセストークンを伴わない、または無効・期限切れのトークンを伴う MCP リクエストを受信したとき, then the MCP サーバー shall `401 Unauthorized` を返し、tool を実行しない。
3. When MCP クライアントが認可を開始したとき, the MCP サーバー shall 既存の JWT + OAuth 認証基盤を利用してユーザーを認証し、当該ユーザーに紐づくトークンを発行する。
4. While 有効なトークンで認可済みのセッションが継続している間, the MCP サーバー shall 後続の tool 実行リクエストを当該ユーザーのコンテキストで処理する。
5. The MCP サーバー shall OAuth 2.1 の必須メタデータ（Authorization Server Metadata 等、MCP クライアントが自動接続に必要とする情報）を公開する。
6. The MCP サーバー shall 発行するトークンのスコープを mosaku のメモ read / write に限定する。

### Requirement 3: create_memo tool（書き込み）

**Objective:** AI と壁打ちするユーザーとして、その結果を mosaku に新規メモとして自動保存したい。そうすれば書く手間ゼロで成果物が資産として残る。

#### Acceptance Criteria

1. The MCP サーバー shall `create_memo` tool を `content`（必須）と `notebook`（任意）の入力で公開する。
2. When 認可済みユーザーのクライアントが `create_memo` を有効な `content` で実行したとき, the MCP サーバー shall 当該ユーザー所有の新規メモを作成し、作成されたメモの識別子を含む結果を返す。
3. When `notebook` が指定され、それが当該ユーザー所有のノートブックを指すとき, the MCP サーバー shall 作成したメモをそのノートブックに紐づける。
4. If `notebook` が指定されていないとき, then the MCP サーバー shall 既定の保存先（受け皿となるノートブック）にメモを作成する。
5. If `notebook` が指定されたが当該ユーザーが所有しない、または存在しないとき, then the MCP サーバー shall メモを作成せず、MCP 仕様に準拠したエラー結果を返す。
6. If `content` が空または不正なとき, then the MCP サーバー shall メモを作成せず、入力不正を示すエラー結果を返す。
7. The MCP サーバー shall `create_memo` で作成したメモを、既存の Web UI から閲覧・編集できる通常のメモと同一のデータ表現で保存する。

### Requirement 4: search_memos tool（読み出し）

**Objective:** AI と壁打ちするユーザーとして、過去メモを検索して文脈に取り込みたい。そうすれば AI が自分の長期記憶を思い出して賢く応答できる。

#### Acceptance Criteria

1. The MCP サーバー shall `search_memos` tool を `query`（必須）の入力で公開する。
2. When 認可済みユーザーのクライアントが `search_memos` を実行したとき, the MCP サーバー shall 当該ユーザーが所有するメモのみを検索対象とし、`query` に関連するメモの一覧を返す。
3. The MCP サーバー shall 検索結果に、AI が文脈として利用できる情報（メモの識別子・本文または抜粋・関連付けに必要なメタデータ）を含める。
4. When 関連するメモが存在しないとき, the MCP サーバー shall 空の結果を正常レスポンスとして返す。
5. The MCP サーバー shall 検索結果に他ユーザーが所有するメモおよびゴミ箱（soft delete 済み）のメモを含めない。
6. The MCP サーバー shall 1 回の検索で返す結果件数に上限を設け、過大なレスポンスを防ぐ。

### Requirement 5: 所有権・データ境界

**Objective:** mosaku ユーザーとして、MCP 経由のアクセスが常に自分のデータに閉じていることを保証したい。そうすれば外部 AI に接続しても安全である。

#### Acceptance Criteria

1. The MCP サーバー shall すべての tool 実行において、操作対象が認可済みユーザーの所有物であることを `AuthorizationService.validateOwnership()` で検証する。
2. If 認可済みユーザーが所有しないリソースへの操作が要求されたとき, then the MCP サーバー shall 当該操作を実行せず、アクセス不可を示すエラー結果を返す。
3. The MCP サーバー shall tool 実行において、サーバー側で既存ドメインサービス（memo / notebook 等）を直接呼び出し、フロントエンドの `apiClient` を経由しない。
4. The MCP サーバー shall MCP 経由で作成・更新されるデータを、既存の所有権・データモデルの不変則に準拠させる。

### Requirement 6: レート制限・濫用対策

**Objective:** mosaku 運営者として、外部 AI から叩かれる入口を濫用から守りたい。そうすればサービスの安定性とコストを保てる。

#### Acceptance Criteria

1. The MCP サーバー shall tool 実行リクエストに対してレート制限を適用する。
2. If ユーザーまたはクライアントが設定された上限を超えてリクエストを送信したとき, then the MCP サーバー shall 超過分のリクエストを拒否し、レート超過を示すレスポンスを返す。
3. The MCP サーバー shall レート制限の適用に既存のスロットリング基盤（`@nestjs/throttler`）を利用する。
4. While レート制限により拒否している間, the MCP サーバー shall 正当な他ユーザーのリクエスト処理を妨げない。

### Requirement 7: エラーハンドリングと観測性

**Objective:** 運営者として、MCP 経由の失敗を検知・追跡したい。そうすれば障害を素早く調査・改善できる。

#### Acceptance Criteria

1. If tool 実行中にサーバー内部エラーが発生したとき, then the MCP サーバー shall クライアントに MCP 仕様準拠のエラー結果を返し、内部例外の詳細を直接露出しない。
2. When MCP 経由でハンドリングされない例外が発生したとき, the MCP サーバー shall 既存の Sentry 連携でエラーを捕捉し、構造化タグ契約（`feature_area` 等）に従って記録する。
3. The MCP サーバー shall エラーレスポンスにユーザーの認証情報・トークン等の機微情報を含めない。
4. The MCP サーバー shall MCP 経由の操作を、既存のロギング方針に沿って記録する。

### Requirement 8: 提供形態（定額・従量課金なし）

**Objective:** プロダクトオーナーとして、MCP 機能を従量課金なしで提供したい。そうすれば既存の課金設計を圧迫せずに必殺機能を出せる。

#### Acceptance Criteria

1. The MCP サーバー shall LLM の推論呼び出し（トークン消費）を mosaku 側で行わず、壁打ちはクライアント側 AI に委ねる。
2. The MCP サーバー shall 利用量に応じた従量課金の計測・請求を必要とせず、定額（サブスク込み）で提供可能な構成とする。
3. The MCP サーバー shall `monetization.md` の従量課金モデルとは独立した提供枠として扱える。

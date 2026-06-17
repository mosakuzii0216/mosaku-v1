# Implementation Plan

> 凡例: `(P)` = 並列実行可能（先行タスク完了後）。詳細は各バレットの依存注記を参照。
> 進行順は design.md の Migration Strategy（M0 スパイク → M1 スキーマ → M2 実装 → 段階公開）に従う。

- [x] 1. MCP Streamable HTTP エンドポイントのスパイクと疎通
- [x] 1.1 SDK 導入と McpModule の骨格・feature flag 土台
  - `@modelcontextprotocol/sdk` を backend 依存に追加し、Node 22+ で動作確認
  - 新規ドメインとして McpModule を登録（「1 ドメイン = 1 モジュール」規約準拠）
  - MCP 入口を開閉する feature flag（config パターン）を用意し、off で入口を無効化できる土台を作る
  - _Requirements: 1.1, 1.6_

- [x] 1.2 ステートレス Streamable HTTP 入口の結線と body parser 整合
  - MCP エンドポイントを公開オプトアウトし、既存グローバル JWT Guard を迂回させる
  - リクエスト毎に McpServer + Streamable HTTP transport を生成・破棄するステートレス構成（セッション ID 非生成）
  - JSON ボディパーサと transport のリクエスト本文二重消費を MCP ルートのみで整合させる（design Issue 3 の最序盤ブロッカー）
  - DNS rebinding 対策（Host ヘッダ検証）を有効化
  - _Requirements: 1.1, 1.2, 1.6_

- [x] 1.3 initialize / tools/list 疎通と未知メソッドエラー
  - initialize にサーバー情報とサポート capability を含めて応答
  - tools/list で create_memo / search_memos の名前・説明・入力スキーマを返す（この段はスタブ定義可）
  - 未対応メソッド・未知 tool に対し MCP 仕様準拠のエラーを返す
  - SDK が生成する JSON-RPC エラー整形を確認し、最初のグリーン（tools/list 疎通）を成立させる
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 2. OAuth 永続化スキーマとストア
- [x] 2.1 (P) OAuth 用 3 テーブルのスキーマ追加とマイグレーション
  - OAuth クライアント登録・認可コード・リフレッシュトークンの 3 テーブルを Prisma スキーマに追加
  - 既存ユーザーへの関連を張り（削除時の挙動を検討）、既存テーブルは無変更で後方互換を維持
  - マイグレーション作成・適用と Prisma クライアント再生成を実施
  - task 1 と独立（transport 層に非依存）のため並列実行可
  - _Requirements: 2.1, 2.3_

- [x] 2.2 クライアント / 認可コード / リフレッシュトークンのストア実装
  - DCR クライアントの保存・取得を提供
  - 認可コードの発行と「一回限り消費（使用時削除）」をトランザクションで原子化し二重交換を防止、期限切れは拒否
  - リフレッシュトークンの発行・回転・失効を提供（回転時に旧トークンを同一トランザクションで失効）
  - 2.1 のスキーマに依存
  - _Requirements: 2.1, 2.3_

- [x] 3. MCP 専用トークンの発行と検証
- [x] 3.1 MCP アクセストークン発行ロジック（専用クレーム）
  - 既存 JWT 署名基盤を共有しつつ、audience（canonical MCP URI）+ scope + token_use=mcp を持つ MCP 専用アクセストークンを発行する新規メソッドを実装（既存の固定ペイロード発行は流用不可。design Issue 2）
  - 発行スコープを memo:read / memo:write のホワイトリストに限定
  - _Requirements: 2.6_

- [x] 3.2 Bearer 検証ガードと token verifier
  - MCP 専用 verifier で署名 + audience 一致 + token_use=mcp + scope を検証（REST 用 passport 検証は aud/token_use 非対応のため新設。design Issue 2）
  - トークン無し / 無効 / 期限切れ / aud 不一致は 401 を返し tool を実行せず、WWW-Authenticate に resource_metadata と scope を付与（discovery 起点）
  - token_use が mcp でない（= REST ログイン）トークンを拒否し token passthrough を防止
  - 検証済みユーザーとスコープを後続処理に注入し、当該ユーザー文脈で処理させる
  - 有効/期限切れ/aud 不一致/token_use 不一致/scope 不足の分岐をユニットテストで担保
  - _Requirements: 2.1, 2.2, 2.4, 2.6_

- [x] 4. OAuth 認可サーバー（discovery / DCR / authorize / token）
- [x] 4.1 OAuth メタデータ公開（discovery）
  - Protected Resource Metadata（resource / authorization_servers / scopes_supported）を公開
  - Authorization Server Metadata（issuer / authorize / token / registration エンドポイント / code_challenge_methods_supported=S256 / scopes_supported）を公開
  - URL は既存の BACKEND_URL 生成から組み立て、公開エンドポイントとして提供
  - _Requirements: 1.5, 2.5_

- [x] 4.2 動的クライアント登録（DCR）
  - redirect_uris 等を受理してクライアントを永続化（public client 既定）
  - redirect_uri は登録値と完全一致・localhost / HTTPS のみ許可
  - 登録エンドポイントに個別レート制限を適用し feature flag で開閉可能にする
  - 2.2 のクライアントストアに依存
  - _Requirements: 1.5, 2.1_

- [x] 4.3 authorize と同意画面（既存ログイン再利用）
  - authorize で既存ソーシャルログインセッションを再利用し、未ログインは既存ログインへ誘導してから authorize に復帰
  - 同意画面を BE サーバーレンダリングの最小 HTML で実装（フロントエンドは非変更）、authorize 系ルートのみ CSP / Content-Type を調整
  - 同意成立時に認可コードを発行し code_challenge / resource / scope / state を保存（TTL ≤60s・一回限り）
  - 2.2 の認可コードストアに依存
  - _Requirements: 2.1, 2.3_

- [x] 4.4 token エンドポイント（PKCE 照合 / コード交換 / リフレッシュ回転）
  - PKCE S256 を照合し resource を検証、認可コードを一回限り消費して交換
  - MCP 専用アクセストークン（3.1）と回転対象のリフレッシュトークンを発行
  - confused deputy 回避のため upstream トークンを一切転送しない
  - 3.1 のトークン発行・2.2 のストアに依存
  - _Requirements: 1.5, 2.1, 2.3, 2.6_

- [x] 5. MCP tools 実装（create_memo / search_memos）
- [x] 5.1 認証ユーザー文脈での tool 登録
  - 検証済みユーザー（3.2）をクロージャ束縛して tool を登録し、userId の出所を認証文脈に一意化（クライアント入力で上書き不可）
  - scope を満たさない tool 呼び出しを拒否（insufficient_scope 相当）
  - tools/list をスタブから実装定義（name / description / inputSchema）へ差し替え
  - _Requirements: 1.3, 2.4_

- [x] 5.2 (P) create_memo tool（書き込み）
  - content（必須・非空）+ notebook（任意）の入力スキーマを定義し、空/不正な content は作成せずエラー結果
  - content 先頭行を trim/改行除去して ≤80 文字で title 自動生成、空なら `MCP メモ <ISO日付>`（title NOT NULL 制約に対応）
  - notebook 指定時は所有権検証で解決し、未所有/不存在は作成せずエラー結果
  - notebook 無指定時は既定保存先（未分類）として作成し、作成したメモの識別子を返却
  - 既存ドメインサービスを直呼び（apiClient 非経由）し、Web UI の通常メモと同一データ表現で保存
  - content 空・notebook 未所有・無指定→既定・title 生成の各分岐をユニットテストで担保
  - 5.1 に依存。5.3 とは別 tool のため並列実行可
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 5.4_

- [x] 5.3 (P) search_memos tool（読み出し）
  - query（必須）の入力スキーマを定義
  - 当該ユーザー所有メモのみを検索対象とし、他ユーザー・ゴミ箱（soft delete 済み）を除外
  - 1 回の検索で返す件数に上限（既定 20）を設け、本文抜粋を固定上限で切り詰めて過大レスポンスを防止
  - 結果に識別子・本文または抜粋・関連付けメタデータを含め、該当なしは空結果を正常レスポンスとして返す
  - 既存ドメインサービスを直呼び（apiClient 非経由）
  - userId 限定・ゴミ箱除外・件数上限・空結果の各分岐をユニットテストで担保
  - 5.1 に依存。5.2 とは別 tool のため並列実行可
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3_

- [x] 6. レート制限・エラーハンドリング・観測性
- [x] 6.1 (P) MCP レート制限
  - MCP 用スロットル設定を追加し、tool 実行リクエストに既存スロットリング基盤でユーザー単位のレート制限を適用
  - 上限超過分を拒否しレート超過を示すレスポンス（429 相当）を返す
  - 登録 / authorize / token の各認可エンドポイントにも個別レート制限を適用
  - レート制限中も正当な他ユーザーのリクエスト処理を妨げないことをテストで確認
  - 6.2 とは別関心（throttle）のため並列実行可
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 6.2 (P) エラー秘匿と Sentry / ロギング連携
  - 内部例外を MCP / JSON-RPC 準拠のエラーへ秘匿変換し、内部例外の詳細を直接露出しない
  - Sentry の feature_area 契約に mcp を追加し、ハンドル外例外を既存グローバルフィルタで構造化タグ付きで記録
  - エラーレスポンス・ログにトークン / JWT / 内部スタック等の機微情報を含めない（スクラバ拡張）
  - MCP 経由の操作を既存ロギング方針に沿って記録
  - 6.1 とは別関心（観測性）のため並列実行可
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. 統合・接続検証と段階公開
- [x] 7.1 認可〜tool 実行の統合テスト
  - 401 → well-known discovery → authorize → token → MCP tool 呼び出しの一連を統合テスト（自動接続経路）
  - PKCE S256 照合・認可コード一回限り・リフレッシュ回転・scope ホワイトリストの正常/異常系を検証
  - _Requirements: 1.5, 2.1, 2.5_

- [x] 7.2 既存無影響・トークン相互排他・提供形態の回帰テスト
  - 既存 REST エンドポイントが MCP 導入後も従来通り認証・スロットルされる回帰を検証
  - MCP トークンで REST が、REST トークンで MCP が、それぞれ拒否される相互排他（passthrough 防止）を検証
  - mosaku 側で LLM 推論を呼ばず、従量計測・請求を持たない定額（サブスク込み）構成であり、従量課金モデルと独立した提供枠であることを確認
  - _Requirements: 1.6, 8.1, 8.2, 8.3_

- [x] 7.3 Claude Code 実接続による受け入れ確認と feature flag
  - feature flag off で本番デプロイ可能・off で MCP 入口を即時無効化できる（既存機能に無影響）ことを確認
  - Claude Code（`claude mcp add --transport http <url>`）で実接続し tools/list / create_memo / search_memos の成功を確認
  - claude.ai Custom Connector（DCR 自動登録〜接続）を段階公開対象として確認
  - _Requirements: 1.5_
    </content>
    </invoke>

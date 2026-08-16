# Implementation Plan — dogfooding-friction-log

> 実装は以下の依存順で進める。**1 → 2（2.1〜2.3 並列） → 3 → 4・5 並列 → 6（並列） → 7（並列） → 8 → 9 → 10 → 11**。
> 新規 JS/NPM ライブラリは一切追加しない（要件 3.5 / 6.2）。既存の NestJS 11・React 19・TipTap・Zustand・React Query・zod・Sentry・Node.js 22 標準 `fetch` の範囲で完結させる。

## 1. DB スキーマに汎用メタデータ列を追加する

- [ ] 1. Prisma スキーマで Memo と Notebook に `metadata Json?` 列を追加し、マイグレーション `add_memo_notebook_metadata` を作成・適用する。既存行は `NULL` で維持し、既存 API の後方互換を壊さないこと。Prisma クライアントを再生成して型を更新する。
  - `Theme.metadata Json? @default("{}")` の前例に合わせて nullable `Json` として定義
  - マイグレーション後に既存の `GET /memos` / `GET /notebooks` が通常通り返ることを手動確認
  - `npx prisma generate` で `@prisma/client` の Memo/Notebook 型に `metadata: Prisma.JsonValue | null` が反映されることを確認
  - _Requirements: 1.2, 2.2, 4.2, 5.5_

## 2. BE 共通基盤を整備する

- [ ] 2.1 (P) 摩擦ログ用の zod 判別共用体バリデータを導入する
  - `kind: 'friction'` / `kind: 'friction-log'` / `null` を受け付ける `discriminatedUnion` を定義
  - `FrictionMemoMetadata`（severity / specStatus / specRef / slackNotifiedAt / recorderRole / templateVersion）を strict モードで検証
  - Memo 用の厳格パース（create/update 書き込み経路）と、読み出し用の寛容パース（未知値は `null` フォールバック）を両方提供する
  - 不正値（未知 kind、severity 欠損、slackNotifiedAt が非 ISO-8601、追加プロパティ）を `BadRequestException` として弾くユニットテストを書く
  - 将来の `user-feedback` 拡張で `recorderRole: 'user'` や新 `kind` を増やしやすい構造にする（discriminated union の原則維持）
  - _Requirements: 2.2, 2.4, 4.2, 6.3, 6.5, 6.6_

- [ ] 2.2 (P) `AuthorizationService` に ADMIN 強制ヘルパを追加する
  - 既存 `AdminGuard` と同じ `ERROR_CODES.AUTHZ.ADMIN_ONLY` を使う純粋関数的ヘルパを公開する
  - ADMIN / USER / 未認証の 3 パターンでユニットテストを書き、ガードと動作等価であることを固定する
  - 既存 `AuthorizationService` の他メソッド（`validateOwnership` など）の挙動は変えない
  - _Requirements: 6.4_

- [ ] 2.3 (P) `ConfigService` に `slackWebhookUrl` getter を追加する
  - `SLACK_WEBHOOK_URL` 環境変数を optional として読み出し、未設定時は `undefined` を返す
  - ログ出力や `generate*Url` 系に URL が混入しないことをユニットテストで確認（秘匿性担保）
  - ローカル `.env.example` に項目を追加するが、本番値は Cloud Run Secret Manager に委ねる運用メモを残す
  - _Requirements: 5.1, 5.3_

## 3. BE Slack 通知サービスを実装する

- [ ] 3. `FrictionSlackNotifier` を実装し、`blocker` 遷移時のみ Slack Incoming Webhook に 1 回 POST して `slackNotifiedAt` を更新する。Node.js 22 標準 `fetch` のみを使い、失敗は `@sentry/nestjs` で握りつぶす。
  - `SLACK_WEBHOOK_URL` が未設定なら即 `return`（ノーオペ）
  - 旧メタデータが非 `blocker` かつ新メタデータが `blocker` のときだけ送信（新規作成もこの条件に含める）
  - 同一メモは `slackNotifiedAt` から 24 時間以内の再送を禁止し、境界値（23h59m / 24h00m01s）でテスト
  - 送信成功後のみ `metadata.slackNotifiedAt` を ISO-8601 現在時刻で更新
  - Webhook が 4xx/5xx を返した場合・ネットワーク例外時は `Sentry.captureException`（tag `friction.slack`）のみ呼び、呼び出し元に例外を伝播させない
  - ペイロードは `text` と `blocks`（メモタイトル / 領域タグ / 本文先頭 140 文字 / ディープリンク）を含める。ディープリンクは `ConfigService.frontendUrl` をホワイトリストとして生成
  - 依存: 2.1（Validator）・2.3（ConfigService）
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.2_

## 4. BE Memo ドメインを摩擦ログ対応に拡張する

- [ ] 4.1 (P) `CreateMemoDto` / `UpdateMemoDto` に `metadata?: unknown` を追加し、サービス層で 2.1 のバリデータを通すようにする。未指定は従来通り `null` として保存される挙動を固定する。
  - 既存の memo 作成・更新テスト（`memo.service.spec.ts` / `memo.controller.spec.ts`）が破壊的に変化しないことを回帰テストで確認
  - `metadata: null` を明示すれば既存値を消去できる動作を追加テストで担保
  - _Requirements: 1.2, 1.4, 2.2, 4.2_

- [ ] 4.2 `MemoService.create` / `MemoService.update` に ADMIN ゲートと Slack 通知フックを組み込む
  - `metadata.kind === 'friction'` を検知したとき、`AuthorizationService.requireAdmin` を呼んで USER は 403 で拒否
  - `metadata.recorderRole` は Phase 1 では `'admin'` を強制（不一致なら 400）
  - 書き込みトランザクション完了後に `FrictionSlackNotifier.notifyBlockerIfNeeded` を `await` 呼び出しし、例外は握りつぶす
  - 所有権・自動保存・ゴミ箱・Trash 系エンドポイントの挙動は一切変更しない
  - 依存: 4.1（DTO）, 2.2（requireAdmin）, 3（SlackNotifier）
  - _Requirements: 1.1, 1.2, 1.4, 4.2, 5.2, 5.5, 6.4_

- [ ] 4.3 (P) Memo ドメインの統合テストを拡充する
  - ADMIN で friction metadata 付き POST → 201 + Slack mock 1 回呼出
  - severity を `major → blocker → major → blocker` と連打しても Slack mock は 1 回のみ
  - USER で friction metadata 付き POST → 403（`ERROR_CODES.AUTHZ.ADMIN_ONLY`）
  - metadata 不正値 → 400（zod エラーを DTO 経路で拾う）
  - 既存 memo の GET レスポンスに `metadata` フィールドが含まれ、通常メモは `null` で返る
  - _Requirements: 1.2, 2.2, 4.2, 5.2, 5.5, 6.4_

## 5. BE Notebook ドメインを摩擦ログ対応に拡張する

- [ ] 5.1 (P) `CreateNotebookDto` / `UpdateNotebookDto` に `metadata?: unknown` を追加し、サービス層で 2.1 のバリデータを通す。`metadata.kind === 'friction-log'` はユーザーあたり最大 1 個の一意制約をサービス層で強制する。
  - 作成前に「同一ユーザーで `metadata.kind === 'friction-log'` を持つ Notebook が既に存在するか」を count で確認し、存在すれば 409 を返す
  - `metadata.kind === 'friction-log'` の作成・更新も `AuthorizationService.requireAdmin` を通す
  - Phase 1 はユーザー 1 名運用のため楽観的チェックで十分。同時 2 POST の競合発生時は後勝ちで 2 件目を削除するリカバリ手順をサービス内で実装
  - _Requirements: 1.1, 1.2, 1.3, 6.4_

- [ ] 5.2 (P) Notebook ドメインの統合テストを追加する
  - ADMIN で friction-log Notebook 作成 → 成功、2 回目 → 409
  - USER で friction-log Notebook 作成 → 403
  - 通常 Notebook（metadata 未指定）の従来テストが破壊されないこと
  - 重複検出時のリカバリ（後勝ち削除）が所有権境界を越えないこと
  - _Requirements: 1.1, 1.2, 1.3, 6.4_

## 6. FE 共有基盤（型・定数・既存フック拡張）を整える

- [ ] 6.1 (P) FE の共有型に `metadata` フィールドを追加する
  - `types/memo.ts` / `types/notebook.ts` に `metadata?: FrictionMemoMetadata | FrictionLogNotebookMetadata | null` を追加
  - 摩擦ログ専用の型（severity / specStatus / specRef / slackNotifiedAt / recorderRole / templateVersion）を新規ファイルにまとめ、BE の zod 型と同構造に保つ
  - 既存の `apiClient` のレスポンス型が破壊されないことをビルドで確認
  - _Requirements: 2.2, 4.2, 6.3_

- [ ] 6.2 (P) 摩擦ログテンプレート定数を新設する
  - テンプレート本文（発生日時・現象・期待動作・深刻度・領域タグ・再現手順・spec 参照セクション）を TipTap が `setContent` で受け取れる HTML 文字列として返す
  - ロケール `'ja' | 'en'` 切り替えを関数引数で受け、将来の国際化に備える
  - `templateVersion` を 1 から開始し、テンプレ改訂時にインクリメントする運用をコメントで明示（実装上の WHY としてのみ記載）
  - `appendSpecReferenceSection(content, specRef)` で本文末尾に spec 参照を追記するユーティリティを同梱し、べき等性をユニットテストで確認
  - _Requirements: 2.1, 2.5, 4.3_

- [ ] 6.3 (P) 領域タグプリセット定数を新設する
  - `area:editor` / `area:theme` / `area:auth` / `area:mobile` / `area:notebook` / `area:trash` / `area:infra` を初期プリセットとして配列定義
  - 初回摩擦メモ保存時に未作成のプリセットタグのみ `useTagQueries.create` で作成するヘルパを提供（重複作成しないこと）
  - _Requirements: 1.5, 2.3_

- [ ] 6.4 `useAutoSave` を拡張して `flushPendingSave()` を公開する
  - 保留中デバウンスがあれば即座に `onSave` を発火して await し、その結果（成功/失敗）を Promise で返す
  - 保留がない場合は即 resolve
  - 二重呼び出し時は `inFlight` フラグで同一 Promise を再利用しレースを防ぐ
  - 既存 `useAutoSave.test.ts` に「保留なしで即解決」「保留ありで成功」「保留ありで失敗」「二重呼び出しで同一 Promise」の 4 ケースを追加
  - _Requirements: 3.3_

- [ ] 6.5 (P) 現在ユーザーのロール判定フックを整備する
  - 既存の認証ストアから `role` を取得し、`'ADMIN' | 'USER' | null`（未認証）で返す
  - メモ化して不要な再レンダーを抑制
  - _Requirements: 6.4_

## 7. FE 摩擦ログドメインフックを実装する

- [ ] 7.1 (P) `useFrictionLogNotebook` を実装する
  - `useNotebooks()` のキャッシュから `metadata?.kind === 'friction-log'` の Notebook を抽出
  - 未存在時に `useCreateNotebook` で `{ name: 'Friction Log', metadata: { kind: 'friction-log' } }` を作成する `ensureNotebook()` を提供
  - ローディング・エラー状態を返し、呼び出し元でフォールバック UI を描画できるようにする
  - 複数検出時は最古のものを採用し、Sentry に `friction.notebook.duplicate` タグで警告送信
  - 依存: 6.1（型）
  - _Requirements: 1.1, 1.3, 3.1_

- [ ] 7.2 (P) `useFrictionMemos` を実装する
  - `useMemos()` をベースに、指定された摩擦ログ Notebook 配下かつ `metadata?.kind === 'friction'` のメモのみを抽出
  - `mode: 'triage'` では過去 7 日・`specStatus: 'todo'`・`severity: 'blocker' | 'major'` を優先表示し、`'done' | 'rejected'` は既定から除外
  - 領域タグ × severity の件数を集計する純粋関数 `aggregateByAreaSeverity` を切り出してユニットテストを書く
  - メタデータが壊れているメモは警告ログを出し「深刻度 未設定」として描画できる形で返す
  - _Requirements: 4.1, 4.4, 4.5, 4.6_

- [ ] 7.3 `useNavigation` に `goToFrictionCapture()` を追加する
  - 内部で `useFrictionLogNotebook.ensureNotebook()` を await してから、既存 `goToMemoCreate` 相当のナビゲーションを発火
  - 摩擦ログ Notebook が取得できない／作成失敗時はエラートーストを出し遷移を中止（UI 層でハンドリング）
  - 既存の他ナビゲーションアクションの挙動は変えない
  - 依存: 7.1
  - _Requirements: 3.1, 3.3_

## 8. FE クイックキャプチャ導線を実装する

- [ ] 8.1 (P) `Cmd/Ctrl + Shift + F` グローバルショートカットフックを実装する
  - `window.keydown` リスナーで metaKey/ctrlKey + shiftKey + Key `F` を検知（IME 変換中・エディタ内など競合コンテキストでは無視）
  - ADMIN でない場合はリスナー自体を登録しない
  - 起動時に編集中メモの `useAutoSave.flushPendingSave()` を await してから `useNavigation.goToFrictionCapture()` を呼ぶ
  - 依存: 6.4（flush）, 6.5（role）, 7.3（navigation）
  - _Requirements: 3.1, 3.3, 3.5, 6.4_

- [ ] 8.2 (P) ヘッダー用の摩擦ログキャプチャボタンを実装する
  - ADMIN のみ表示
  - クリックで `useNavigation.goToFrictionCapture()` を呼ぶ
  - 既存の `DesktopLayout` のヘッダー領域に統合し、通常メモ作成ボタンと視覚的に並列配置する
  - _Requirements: 3.1, 6.4_

- [ ] 8.3 (P) モバイル用 FAB を実装する
  - ADMIN のみ表示
  - `MobileLayout` に統合し、`position: fixed; right: 16px; bottom: calc(<toolbarHeight> + safe-area + 16px)` で既存ツールバーと干渉しない配置
  - タップで `useNavigation.goToFrictionCapture()` を呼ぶ
  - _Requirements: 3.4, 3.5, 6.4_

- [ ] 8.4 ルートレイアウトでショートカットフックを 1 度だけ登録する
  - `DesktopLayout` / `MobileLayout` のいずれか上位 1 箇所で `useFrictionShortcut` を呼び、二重登録を防ぐ
  - 依存: 8.1
  - _Requirements: 3.1_

## 9. FE 摩擦ログエディタとメタデータパネルを実装する

- [ ] 9.1 摩擦ログメモエディタを既存 `MemoEditor` の派生として実装する
  - `isCreate` かつ対象 Notebook が摩擦ログ専用のとき、6.2 のテンプレート HTML を初期 `content` に流し込む
  - 自動保存は既存 `useAutoSave`（2 秒デバウンス）をそのまま利用
  - 保存ペイロードに `metadata`（severity / specStatus / specRef / recorderRole='admin' / templateVersion）を含める
  - spec 化ステータスが `speccing` に遷移したタイミングで本文末尾の spec 参照セクションを挿入・更新する
  - 依存: 6.1, 6.2, 7.1
  - _Requirements: 1.4, 2.1, 2.5, 3.2, 4.3_

- [ ] 9.2 (P) メタデータ編集パネルを実装する
  - severity（radio で 4 値）、specStatus（select で 4 値）、specRef（テキスト）、templateVersion（read-only 表示）を編集できる UI
  - severity または領域タグが未設定のまま保存しようとした場合はインライン警告を出すが、保存自体はブロックしない
  - 依存: 6.1
  - _Requirements: 2.2, 2.3, 2.4, 4.2_

## 10. FE 週次トリアージビューを実装する

- [ ] 10.1 摩擦ログ Notebook 詳細ビューに重ねるトリアージオーバーレイを実装する
  - 対象 Notebook の `metadata?.kind === 'friction-log'` のときのみマウント
  - フィルタバー（severity / specStatus / 期間）とソート（更新日 / 深刻度）を提供
  - `mode: 'triage'` と `'all'` を切り替えるトグルを用意し、既定は `'triage'`
  - 依存: 7.2
  - _Requirements: 4.1, 4.4, 4.6_

- [ ] 10.2 (P) 同種摩擦の件数バッジを実装する
  - `useFrictionMemos` の集計値を受け取り、領域タグ × severity の組み合わせごとの件数を Tooltip で表示
  - トリアージリストの各行に併記
  - 依存: 7.2
  - _Requirements: 4.5_

- [ ] 10.3 (P) メタデータ破損時のフォールバック描画を検証する
  - `metadata` が zod 寛容パースで `null` になったメモは「深刻度 未設定」でリストに残ること
  - トリアージビューから消えず、修正誘導ができる状態であること
  - _Requirements: 2.4, 4.1_

## 11. E2E・パフォーマンス・機能フラグで統合を仕上げる

- [ ] 11.1 機能フラグ `FRICTION_LOG_ENABLED` を `frontend/src/constants/features.ts` に追加し、未有効時はショートカット・ボタン・FAB・トリアージオーバーレイが一切マウントされないことをユニットテストで固定する。Phase 1 の初回リリースでは ADMIN 環境のみ `true` で配信する。
  - _Requirements: 3.1, 3.4, 6.4, 6.5_

- [ ] 11.2 Playwright E2E: ゴールデンパス
  - ADMIN ログイン → `Cmd+Shift+F` → 摩擦ログ Notebook 自動生成 → テンプレ付きエディタ → severity=blocker 入力・保存 → 一覧に反映
  - 依存: 1, 4, 5, 7, 8, 9, 10
  - _Requirements: 1.1, 1.3, 2.1, 3.1, 3.2, 5.2_

- [ ] 11.3 (P) Playwright E2E: ロールガードとモバイル導線
  - USER ログインで `Cmd+Shift+F` を押しても何も起きず、ボタン・FAB も非表示であること
  - モバイルビューで FAB タップ → 摩擦ログエディタが開くこと
  - _Requirements: 3.4, 6.4_

- [ ] 11.4 (P) Playwright E2E: トリアージ操作
  - 既定で `triage` モード表示、`done` メモが除外されること
  - spec 化ステータスを `speccing` に変更 → 本文末尾に spec 参照セクションが追加されること
  - 同種摩擦の件数バッジが期待通りに増減すること
  - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_

- [ ] 11.5 (P) パフォーマンス計測タスク
  - `POST /memos`（friction metadata 付き）の p95 が通常メモ POST と同等であること
  - 摩擦ログ Notebook に 500 件のメモがある状態で `useFrictionMemos` 初回描画が 200ms 以内（Chrome DevTools CPU 4x throttle）で完了すること
  - _Requirements: 6.1_

- [ ]\* 11.6 (P) Slack 通知の実 Webhook 疎通確認（任意・deferrable）
  - staging 環境で実 Slack Webhook を叩くダミー送信スクリプトを動かし、2xx 応答とチャンネル表示を目視確認する
  - Sentry が失敗時のみ通知を受け取ることを確認
  - MVP リリース後に実施してよい補助検証
  - _Requirements: 5.1, 5.2, 5.4_

## 要件カバレッジ確認

| Requirement | Covered by Tasks                                        |
| ----------- | ------------------------------------------------------- |
| 1.1         | 1, 4.2, 5.1, 7.1, 11.2                                  |
| 1.2         | 1, 2.1, 4.1, 4.2, 4.3, 5.1, 5.2                         |
| 1.3         | 5.1, 5.2, 7.1, 11.2                                     |
| 1.4         | 4.1, 4.2, 9.1                                           |
| 1.5         | 6.3                                                     |
| 2.1         | 6.2, 9.1, 11.2                                          |
| 2.2         | 2.1, 4.1, 4.3, 6.1, 9.2                                 |
| 2.3         | 6.3, 9.2                                                |
| 2.4         | 2.1, 9.2, 10.3                                          |
| 2.5         | 6.2, 9.1                                                |
| 3.1         | 7.3, 8.1, 8.2, 8.4, 11.1, 11.2                          |
| 3.2         | 9.1, 11.2                                               |
| 3.3         | 6.4, 7.3, 8.1                                           |
| 3.4         | 8.3, 11.1, 11.3                                         |
| 3.5         | 8.1, 8.3                                                |
| 4.1         | 7.2, 10.1, 10.3, 11.4                                   |
| 4.2         | 2.1, 4.1, 4.2, 4.3, 9.2                                 |
| 4.3         | 6.2, 9.1, 11.4                                          |
| 4.4         | 7.2, 10.1, 11.4                                         |
| 4.5         | 7.2, 10.2, 11.4                                         |
| 4.6         | 7.2, 10.1, 11.4                                         |
| 5.1         | 2.3, 3, 11.6                                            |
| 5.2         | 3, 4.2, 4.3, 11.2, 11.6                                 |
| 5.3         | 2.3, 3                                                  |
| 5.4         | 3, 11.6                                                 |
| 5.5         | 1, 3, 4.2, 4.3                                          |
| 6.1         | 11.5                                                    |
| 6.2         | 3, 設計・実装全体で新規ライブラリ追加禁止を徹底         |
| 6.3         | 2.1, 6.1                                                |
| 6.4         | 2.2, 4.2, 4.3, 5.1, 5.2, 6.5, 8.1, 8.2, 8.3, 11.1, 11.3 |
| 6.5         | 2.1（discriminated union 設計で将来拡張の余地を担保）   |
| 6.6         | 2.1（`kind: 'friction'` のみ受容することで境界を限定）  |

# Implementation Plan

> 並列実行ルールに沿って `(P)` マーカーを付与。原則として、別境界（Backend / IndexedDB スキーマ / SW 設定）で完結する独立タスクのみを並列対象とする。
> Major タスク内のサブタスクは原則順次（同一モジュールへの編集が衝突しがちなため）。並列可能な箇所のみ明示する。

## 1. PWA アプリシェルと Service Worker 基盤の再構築

- [x] 1.1 既存の `vite-plugin-pwa` 設定から `/api/*` の runtimeCaching を完全に除去し、Web App Manifest（名前 / アイコン / `display: standalone` / テーマカラー / 開始 URL）と precache 対象（HTML / JS / CSS / フォント / アイコン）を再定義する
  - `registerType` を `'autoUpdate'` から `'prompt'` へ変更し、ユーザー操作起点の安全な更新フローを成立させる
  - precache の `globPatterns` から `themes/*.css` を除外し、テーマ CSS は遅延 runtime キャッシュ（CacheFirst, テーマ用キャッシュ名）に分離する
  - 認証必須エンドポイントが SW Cache に書き込まれないことを config レビューおよびユニットテストで確認する
  - precache 後のサイズが既存ビルドサイズの 1.5 倍以下に収まることを CI で計測するチェックを追加する
  - _Requirements: 1.1, 1.2, 1.4, 8.3, 9.1, 9.4_

- [x] 1.2 SW 登録ラッパー（`useRegisterSW` のラップ）と更新通知トースト UI を実装し、新しい SW が利用可能になった際の安全な有効化フローを構築する
  - 「更新する」操作で SW 切替、「あとで」は次回起動時に有効化、と二択を提供する
  - 初回登録時に旧 `api-cache` を `caches.delete()` で破棄する初期化処理を組み込み、移行時の認証情報残留を排除する
  - オフライン起動時にログイン画面ではなく直近のメモ一覧画面が初期表示されることを確認する
  - _Requirements: 1.3, 1.5, 1.6, 9.4_

## 2. IndexedDB ローカル永続層と Repository

- [x] 2.1 `idb` ライブラリを依存追加し、`mosaku-offline` データベース v1 のスキーマ（`memos` / `pending_operations` / `meta` の各ストアと必要なインデックス）を定義し、open/upgrade と破損時の `deleteDB → reopen` リカバリを実装する
  - `memos` には `byUser` / `byUpdatedAt` / `byNotebook` インデックスを設ける
  - `pending_operations` は `autoIncrement` キーと `byMemoId` / `byEnqueuedAt` インデックスを設ける
  - `meta` に `currentUserId` / `lastSyncAt` / `schemaVersion` を保持する
  - upgrade 失敗または構造検査例外を捕捉した場合は DB を完全に破棄して再構築し、UI に「オフラインキャッシュを再構築しました」を通知するシグナルを返す
  - _Requirements: 2.5, 2.6_

- [x] 2.2 ローカルメモの読み取り API（一覧 / 単一取得 / サーバー応答からの差分 upsert）を Repository として実装し、React Query から read-through で利用可能にする
  - 一覧はタグ ID 群によるフィルタとノートブック ID フィルタ、`updatedAt` 降順の並び替えをローカルで完結させる
  - サーバー応答の upsert 時に `searchableText = stripHtml(content)` を派生フィールドとして保存する
  - 容量上限・件数上限超過時には QuotaManager の退避ロジックを末尾で起動する
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.3_

- [x] 2.3 オフライン保存パス（`saveLocal`）と保留キュー操作（`enqueueOperation` / `listPending` / `removePending`）を実装し、同一メモへの複数操作を最新内容で 1 件に collapse する
  - 操作種別として「更新 / ゴミ箱送り / 完全削除」を区別して保持する
  - 保存・キュー登録は `memos` + `pending_operations` を含む単一の `readwrite` トランザクションでアトミックに実行する
  - `clientUpdatedAt` が ISO8601 でない場合は早期 reject し、Sentry breadcrumb（warning）を残す
  - 同一 `memoId + kind` のキューエントリは高々 1 件、という不変条件をユニットテストで担保する
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

- [x] 2.4 ローカル全文検索（タイトル + 本文プレーンテキストの部分一致 / 大文字小文字非依存）を Repository に追加し、200 件キャッシュ時にミドルレンジ端末で 300 ms 以内に最初の結果を返せることをベンチで確認する
  - 検索ヒット箇所のスニペット生成（前後数十文字）を Repository が返却する
  - キャッシュ範囲外ヒットの可能性を呼び出し元へ伝えるためのフラグ（クエリ後にローカル件数 0 の場合のメタ情報）を返す
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2.5 単一ユーザースコープの保護（`verifyOwnerOrPurge`）とログアウト時の完全パージ（`purgeForUser`）を実装し、端末共有時の混入とログアウト後のローカル残留を防ぐ
  - 起動時に `meta.currentUserId` を現在のセッションユーザーと突き合わせ、不一致なら全ストアを破棄してから再オープンする
  - ログアウト処理の延長で Repository のパージを呼び、`memos` / `pending_operations` / ユーザー固有 `meta` が削除されることを検証する
  - _Requirements: 9.2, 9.3_

## 3. ストレージ容量と退避制御

- [x] 3.1 `navigator.storage.estimate()` を用いた容量スナップショット取得と、`quotaBytes < 100 MB` 時の `maxEntries` 比例縮小ロジックを実装する
  - estimate 失敗時は固定上限 50 MB / 200 件で運用するフォールバックを用意する
  - 80% 超過の閾値判定をスナップショットに含めて上位へ伝える
  - _Requirements: 8.1, 8.5_

- [x] 3.2 容量逼迫時の退避（`updatedAt` 昇順削除）を実装し、`syncStatus === 'offline-saved'` のメモは退避対象から除外する
  - 退避はサーバー上のメモを削除しないことをユニットテストで明示する
  - 80% 閾値到達時にユーザーへ通知するイベントを発火し、UI トースト連携の足場を作る
  - _Requirements: 2.4, 8.2_

## 4. ネットワーク状態の検知と公開

- [x] 4.1 (P) `NetworkStatusStore` を Zustand で実装し、`online` / `unstable` / `offline` の 3 値状態を `window` の `online`/`offline` イベントを一次シグナルとして提供する
  - 状態変更時に `lastChangeAt` を更新し、購読者に同期的に通知する
  - プロセス起動時は `'unstable'` から開始し、初回 heartbeat 結果で確定する初期化フローを設ける
  - `visibilityState: 'hidden'` の間は heartbeat を停止し、復帰時に再開する
  - _Requirements: 7.1, 7.2_

- [x] 4.2 軽量 heartbeat（`apiClient.health()` の追加と HEAD 相当の通信）と連続失敗 2 回で `'unstable' → 'offline'` に遷移する判定ロジックを組み込む
  - 既存テーマエフェクトの自動停止条件（`prefers-reduced-motion` / エディタフォーカス / `visibilityState` / マウスアイドル）と矛盾しないよう、独自の RAF / setInterval を増やさず単一タイマーで実装する
  - heartbeat の最大間隔・最小間隔・バックオフを設定で可変にし、ユニットテストでフェイクタイマーから挙動を検証する
  - _Requirements: 7.1, 8.4_

## 5. バックエンドの last-write-wins 対応

- [ ] 5.1 (P) `UpdateMemoDto` に `clientUpdatedAt`（オプショナル / `@IsISO8601()`）を追加し、未指定時は従来挙動のままとする後方互換を維持する
  - DTO バリデーションでタイムゾーン情報の欠落を弾くこと、未指定時はバリデーションをスキップすることをユニットテストで担保する
  - _Requirements: 6.2_

- [ ] 5.2 (P) `MemoService.update` に `clientUpdatedAt` 比較分岐を実装し、サーバー側 `updatedAt` がクライアントより新しい場合に `ConflictException` を投げてレスポンスボディに現在の Memo（`getDefaultInclude` 込み）を含める
  - 比較は UTC ミリ秒に正規化（`getTime()`）してタイムゾーン交差ケースに対応する
  - 既存所有権バリデーションと `BaseOwnableService` の責務境界を維持し、`update` 内部で分岐を実装する
  - 未指定時は無条件上書き（既存挙動）であることを明示するテストを残す
  - _Requirements: 6.2, 6.3_

- [ ] 5.3 (P) Supertest による e2e テストで、`PATCH /memos/:id` の (a) `clientUpdatedAt` 未送信時の 200 / (b) クライアントの方が新しい場合の 200 / (c) サーバーの方が新しい場合の 409 + 現在表現を検証する
  - 401 / 403 / 404 の既存挙動が壊れていないことを併せて確認する
  - _Requirements: 6.2, 6.3, 6.5_

## 6. SyncEngine（保留キュードレインと last-write-wins 同期）

- [ ] 6.1 SyncEngine をシングルトン構造で実装し、`BroadcastChannel('mosaku-sync')` によるタブ間リーダー選出（先勝ち）とリーダー喪失時の `aborted` 結果返却を成立させる
  - リーダー以外のタブはキュー操作のみ可能とし、ドレインを開始しないことを並行起動シナリオの単体テストで検証する
  - `start()` / `stop()` / `isRunning()` を提供し、ホットリロード時にタイマー多重起動を防ぐ
  - _Requirements: 6.1, 6.7_

- [ ] 6.2 ドレインサイクル本体を実装し、保留キューを `updatedAt` 昇順に走査して `apiClient.updateMemo` 等を発行、ステータスごとに分岐させる
  - 200 系成功時はサーバー応答でローカル `memos` を上書きしキューを除去
  - 409（last-write-wins 敗北）時はサーバー版で上書きし、スキップ通知バッチへ `{ memoId, title }` を蓄積
  - 404 時は対象エントリをキューから取り除き、ローカルキャッシュも削除した上でユーザー通知バッチへ追加
  - 401 / 403 時はサイクルを中断し `auth-required` イベントを発火、保留キューは保持
  - サイクル完了後にメモ一覧の再取得を行いローカルキャッシュと React Query キャッシュを再同期する
  - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 7.4_

- [ ] 6.3 5xx / ネットワーク再切断時の指数バックオフ（初期 2 秒 / 最大 5 分 / 最大 3 回）と、上限到達時の Sentry error イベント発火を実装する
  - リトライによりキューが失われないことを永続化テストで担保する
  - サイクルがバックオフ中に網が再び切れた場合の中断と、再オンライン後の自動再開を検証する
  - _Requirements: 6.4, 10.2_

- [ ] 6.4 `SyncEvent`（`cycle-start` / `cycle-complete` / `pending-changed` / `auth-required`）の発火と、サイクル完了時のスキップタイトル列挙トースト用ペイロード生成を実装する
  - `cycle-complete` の result に `succeeded` / `skippedByLww` / `failed` を含める
  - 保留件数の変化（追加・削除）を都度 `pending-changed` で通知する
  - _Requirements: 7.5, 10.1_

- [ ] 6.5 サイクル中に新規オフライン編集が enqueue された場合の挙動として、現サイクルでは送信せず完了後に再ドレインを起動するロジックを実装し、ユニットテストで再起動が高々 1 度であることを検証する
  - サイクル多重起動を防ぐミューテックスを実装する
  - _Requirements: 6.7_

## 7. SyncTelemetry（Sentry 観測性）

- [ ] 7.1 同期成功 / スキップ / 失敗の breadcrumb と、リトライ上限到達時のみ `level: 'error'` の Sentry イベントを送出するヘルパーを実装する
  - `feature_area: 'memo'` / `route` / `user_facing` のタグを必ず付与する
  - breadcrumb の `data` を `memoId` / ステータスコード / `attempt` のみのホワイトリストに限定する
  - 既存 `sentry-scrubber` を経路に挟み、想定外フィールド追加時もメモ本文・タイトルを送信しない二重防御をユニットテストで確認する
  - 既存サンプリング戦略（`SENTRY_TRACES_SAMPLE_RATE`）に影響しないよう、Trace API は使用しない
  - _Requirements: 9.5, 10.1, 10.2, 10.4_

## 8. React Query / 自動保存 / 初期化との統合

- [ ] 8.1 React Query の memo 系 query / mutation を `OfflineMemoRepository` 経由に切り替え、`networkMode: 'offlineFirst'` を全クエリ・ミューテーションに適用する
  - フック層から `apiClient` への直接依存を解除し、Repository の `apiClient` 注入経由に統一する
  - `onMutate` の楽観更新後は Repository 結果での再上書きを行わず、二重更新による「一瞬古い値に戻る」現象を排除する
  - オフライン中は新規メモ作成を行わない方針（前提仕様）に従い、対応 mutation はオンライン時のみ発火する
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.6, 5.1_

- [ ] 8.2 `useAutoSave` の SaveStatus を `'offline-saved'` 込みの 6 値 discriminated union に拡張し、Repository からの `OfflineSavedSignal` を resolve、サーバーエラーのみ reject という応答プロトコルを実装する
  - オフライン保存時は既存の自動保存タイミング（編集停止後 2 秒）を維持する
  - `'offline-saved' → 'saved'` の遷移は `useAutoSave` ではなく上位（`MemoEditor` 内の `SyncEngine` イベント購読）で行う方針を実装と単体テストの両方で固定する
  - 既存テスト（`useAutoSave.test.ts`）を拡張し、`'offline-saved'` 遷移と再オンライン後の `'saved'` 復帰を検証する
  - _Requirements: 4.1, 4.7_

- [ ] 8.3 `useNetworkStatus` / `useSyncEngine` / `useSwRegistration` フックと、Repository の `ready: Promise<void>` を待ってから React Query の `enabled` を解放する `useAppInit` の初期化順序を整える
  - 起動順序: SW 登録 → IDB 初期化 → 所有者検証 → NetworkStatusStore 起動 → SyncEngine 起動 → React Query 解放
  - 起動時に `pending_operations` を読んで `'offline-saved'` 表示を再導出し、未送信の編集内容で UI を即時表示する
  - _Requirements: 4.4, 6.7, 7.3, 10.3_

## 9. UI レイヤ（オフライン可視化と通知）

- [ ] 9.1 アプリヘッダーに `OfflineBadge` を常時表示し、`'offline'` を赤、`'unstable'` を黄、未同期件数を数字バッジで可視化する
  - メモ詳細画面でも未同期件数の表示を出し分ける
  - 既存ヘッダーの未保存差分（M Header.tsx）と整合する形で統合する
  - _Requirements: 3.4, 7.2, 7.3_

- [ ] 9.2 `MemoEditor` の自動保存インジケーターを 6 状態の discriminated union で網羅的に分岐し、`'offline-saved'` の専用ラベルとオフライン時の削除/ゴミ箱 confirm ダイアログ文言（「再接続後に同期されます」）を組み込む
  - 削除・ゴミ箱送り操作も Repository 経由に変更し、オフライン時は保留キューに積む
  - _Requirements: 3.4, 4.1, 4.6, 4.7, 7.3_

- [ ] 9.3 (P) `SyncToast` を実装し、`SyncEngine` の `cycle-complete` を購読して、(a) 同期成功件数 / (b) `skippedByLww` のタイトル列挙 / (c) 404 削除済み通知 / (d) リトライ上限到達 を区別して通知する
  - キャッシュ再構築通知（IDB 破損時）も同コンポーネントから出すか、別経路で出すかをデザインに沿って決定し実装する
  - _Requirements: 2.6, 7.4, 7.5, 8.2_

- [ ] 9.4 (P) 設定画面の開発者向けセクションとして `DebugPanel` を追加し、`cachedCount` / `pendingCount` / `lastSyncAt` / `quotaUsage` / 最終同期結果を読み取り専用で表示する
  - `OfflineMemoRepository.statsForDebug()` と `SyncEngine.getLastSyncAt()` を呼び出して構成する
  - 検索範囲外ヒット時の「オフライン範囲のみ検索しました」メッセージ表示の動作確認手段を本パネルから提供する
  - _Requirements: 5.4, 10.3_

## 10. 統合検証とパフォーマンス計測

- [ ] 10.1 Playwright による電車内シナリオ E2E を実装し、(オンラインで読み込み → DevTools `Offline` → 編集 + 自動保存 + 検索 → オンライン復帰 → 自動同期 → サーバーに反映) を一連で検証する
  - 「未キャッシュメモへ遷移時のガイダンス」「オフライン中のタグ / ノートブックフィルタ」「サーバー削除済みメモの 404 通知」も同テストでカバーする
  - _Requirements: 3.1, 3.2, 3.3, 4.4, 5.1, 6.1, 6.6, 7.4_

- [ ] 10.2 (P) インストール / アプリシェル / SW 更新の E2E を実装し、Manifest 検証、standalone 起動時の初期描画 3 秒以内、SW 更新トースト → 「更新」 → 旧 `api-cache` の消滅、を確認する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.4_

- [ ] 10.3 (P) パフォーマンス / 容量計測ジョブを CI に追加し、(a) precache サイズが既存ビルドの 1.5 倍以下、(b) 200 件キャッシュ + 50 件保留での同期スループット 30 秒以内（4G 想定）、(c) 検索 300 ms 以内、を計測する
  - _Requirements: 5.2, 6.4, 8.3_

- [ ]\* 10.4 React Query + Repository 結合の Vitest 統合テスト（オフラインで `useMemos` が IDB から読み取り、再オンラインで `SyncEngine` ドレイン後にキャッシュが更新される）を追加する
  - MVP 完了後にカバレッジ向上目的で着手可。受け入れ基準は E2E（10.1）で既にカバーされる
  - _Requirements: 3.1, 6.6_

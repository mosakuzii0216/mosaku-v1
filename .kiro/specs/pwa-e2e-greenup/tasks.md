# Implementation Plan

> 並列実行可能なタスクには `(P)` を付与。タスク 1（フロント sync）/ タスク 2・3（E2E helper）/ タスク 4（CI seed）は互いに別境界のため並列着手可能。タスク 5 は 1〜4 完了後に実施する統合・緑化タスク。

- [x] 1. ネットワーク再接続時のサーバー状態再取得（アプリ本体バグ是正）

- [x] 1.1 (P) 再接続時再取得ランナーの実装
  - ネットワーク状態の `非online → online` エッジを検知し、メモ・ノート・タグ・ホームダッシュボードの最近メモのサーバー状態クエリを invalidate する純粋ランナーを実装する
  - `start()` 時に現在状態が `online` なら、購読開始前に確定したエッジを取りこぼさないよう初回 reconcile を一度だけ発火する（マウント遅延レースの救済）
  - 直前発火から cooldown（既定 2000ms）以内の再エッジを抑制し、leading-edge + cooldown で多重発行を防ぐ。劣化方向（`online → unstable/offline`）では何もしない
  - invalidate 対象は memo/notebook/tag/dashboard.recentMemos の最小スコープに限定し、オフライン同期エンジン（MemoBridge / SyncEngine）の責務は変更しない。online 以外ではローカル結果のみを返す既存挙動を維持し、空結果を確定値に固定しない
  - 購読・invalidate・時刻源を注入可能（DI）にして単体テストできる構造とする
  - _Contracts: ReconnectRefetcher Service_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 1.2 再接続時再取得ランナーの単体テスト
  - `unstable → online` で invalidate が 1 回呼ばれることを検証する
  - `online → unstable → online` のフラップで cooldown により 1 回に抑制されることを検証する
  - 劣化方向（`online → unstable`）では invalidate しないことを検証する
  - `start()` 時に状態が `online` なら初回 reconcile が 1 回発火し、直後の `online` エッジと cooldown を共有して二重発火しないことを検証する
  - `stop()` 後は購読が解除され発火しないことを検証する
  - _Requirements: 1.1, 1.3, 1.4_

- [x] 1.3 再接続同期フックとレイアウト結線
  - React Query クライアントとネットワーク状態ストアを結線し、再接続時再取得ランナーをマウント時に起動・アンマウントで停止するフックを実装する（一度だけ初期化するガードを設ける）
  - デスクトップ／モバイル両レイアウトで既存の起動初期化フックと並べて呼び出し、認証済み（QueryClientProvider 配下）で一度だけマウントされるようにする
  - fresh コンテキスト（空 IndexedDB）でも online 確立後に一覧がサーバー状態で満たされる前提を成立させる
  - _Contracts: useReconnectSync Service_
  - _Requirements: 1.1, 5.2_

- [x] 1.4 再接続同期フックの単体テスト
  - マウント／アンマウントでランナーが起動・停止することを検証する
  - 二重起動ガードにより同一レイアウト内で重複起動しないことを検証する
  - _Requirements: 1.1, 5.2_

- [x] 2. (P) E2E 認証ヘルパー（ブラウザコンテキスト経由ログイン）
  - ブラウザコンテキスト経由でログインし、HttpOnly の refresh cookie をコンテキストの cookie jar に保存するヘルパーを実装する（accessToken / userId を返しメモ seed に再利用可能とする）
  - localStorage への access token 注入のみに依存せず、cookie を主経路とする（起動時 refresh 失敗で token が消去されるため）。既存のユーザー作成保証ロジックは残置し、cookie 取得のみコンテキスト経由へ移行する
  - 認証セットアップを共有ヘルパーとして提供し、対象 spec が重複実装せず再利用できるようにする。cookie 設定は env 駆動で本番設定（sameSite/secure/domain）を変更しない
  - 隔離環境（backend:3100 / preview:4173 / `mosaku_e2e`）で起動時 refresh が 200 になることを確認する
  - _Contracts: E2EAuthHelper Service_
  - _Requirements: 2.1, 2.3, 2.4_

- [x] 3. (P) E2E メモ一覧遷移ヘルパー
  - ホームダッシュボードからヘッダーの「メモ」ボタン（`getByRole('button', { name: 'メモ', exact: true })`）を操作してメモ一覧へ遷移する共有ヘルパーを実装する
  - メモ一覧ビューが表示されたことを確認してから後続操作へ進む（メモ未取得でも view 自体は表示される）
  - editor/sync 系 spec が再利用できる共有ヘルパーとして提供する（Desktop Chrome project 前提で span「メモ」可視）
  - _Contracts: E2ENavHelper Service_
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. (P) CI seed ユーザーのオンボーディング完了
  - CI の seed step（`pwa-perf.yml` 内の Prisma upsert）で test 管理者ユーザーの `onboardingCompleted` を `true` として設定する（create / update 双方に付与し冪等にする）
  - 認証済み表示時に OnboardingModal が前面に出てクリックを遮らないことを確認する
  - seed をアプリケーションコードに依存しない形（ワークフロー内 Prisma seed）で維持し、本番 seed に影響しないことを保証する
  - _Contracts: CISeedStep Batch_
  - _Requirements: 3.1, 3.2, 3.3, 6.3_

- [ ] 5. 対象 spec の統一と E2E スイートの完全緑化・回帰防止

- [x] 5.1 対象 5 spec の beforeEach を共有ヘルパーへ統一
  - markdown-editor / prose-typography / slash-command / train-scenario / feedback の各 spec の beforeEach を「コンテキスト経由ログイン → ルート遷移 → メモ一覧遷移ヘルパー → memo-item 待機」に統一する
  - 認証済みコンテキストで起動時の自動リフレッシュが成功し、ログイン状態が復元されること、OnboardingModal が操作を妨げないことを前提に成立させる
  - fresh コンテキスト（空 IndexedDB）でメモ一覧が再接続後にサーバー状態で満たされることを前提に memo-item の表示を確認する
  - _Requirements: 2.2, 3.2, 4.1, 4.2, 5.1, 5.2_

- [ ] 5.2 隔離環境ローカル全件実行と CI 緑化・回帰確認
  - 隔離 DB `mosaku_e2e` と代替ポート（backend:3100 / preview:4173）で全 spec を反復実行し、dev 環境・dev DB を汚さずに緑化を再現する
  - `pwa-perf.yml` の e2e ジョブを実行し、残り約 12 件（markdown-editor / prose-typography / slash-command / train-scenario / feedback 系）を含む全 spec がパスすることを確認する
  - 既存パス済み 29 件（特に refresh-token-auto-login / public-memo / auth-flow）に回帰がないことを確認する（invalidate は active クエリのみ・steady online では無発火）
  - `frontend/**` 変更が本番フロントデプロイ（`deploy-frontend-prod.yml`）を誘発しうる点を認識のうえ実施し、同期エンジン再設計・広範な E2E 書き換えは対象外とする
  - _Requirements: 5.1, 5.3, 6.1, 6.2, 6.4_

# Requirements Document

## Project Description (Input)

PWA E2E スイート（.github/workflows/pwa-perf.yml の e2e ジョブ）を完全に緑化する。

【背景】当該 E2E は長期 RED だった。白画面の主因（e2e ビルドに必須 VITE 変数 VITE_APP_URL / VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が欠落。.env.production は gitignore で CI に無い）は解決済みで origin/main に push 済み（commit 615a947 = VITE 変数追加、01023a2 = throttle 緩和 REGISTER/LOGIN/GLOBAL=1000、92f3add = test 管理者を Prisma で直接 seed）。これにより 0→29 passed まで改善。本 spec は残り約12件（editor/sync 系 spec: markdown-editor / prose-typography / slash-command / train-scenario / feedback）を緑にすることがゴール。

【ローカル隔離環境（backend:3100 / preview:4173 / 隔離DB mosaku_e2e）で実証済みの残り真因チェーン】

1. seed ユーザーに onboardingCompleted: true が必要（未完だと OnboardingModal が前面でクリックを遮る）。現在の CI seed step（pwa-perf.yml）に未反映。
2. アプリ起動時に AuthContext の tryAutoRefresh()（POST /auth/refresh）が走り、失敗すると localStorage の access token を消去する。injectAccessToken（localStorage 注入のみ）だけでは復元されない。対策: E2E はブラウザコンテキスト経由でログイン（context.request.post('/auth/login')）し、HttpOnly の refresh cookie をコンテキストに保存する（→ 起動時 refresh が 200 で通り、ログイン状態が復元される。ローカルで実証済み）。
3. ログイン後の初期ビューがメモ一覧からホームダッシュボードに変更された（useViewStore 既定 currentObject: 'home'）。旧 E2E は「/ 着地＝メモ一覧」前提。対策: ヘッダーの「メモ」ボタン（getByRole('button',{name:'メモ',exact:true})）でメモ一覧へ遷移する共有ヘルパーを追加。
4. 【最重要・テスト修正では直らない核心】useMemos → MemoBridge.listMemos は isOnline()（useNetworkStatusStore.status === 'online'）の時のみネットワーク取得する。初期 status は 'unstable'。起動直後に useMemos が走って空の IndexedDB を読み [] をキャッシュし、heartbeat が 'online' に切り替わっても再 fetch されない（ネットワーク捕捉で /memos が一度も呼ばれないことを確認）。本番は永続 IndexedDB に前回データがあるため隠れるが、E2E の fresh コンテキストでは一覧が永遠に空になる。

【方針（設計フェーズで詰める）】4 の本質的修正はアプリ側で「ネットワーク再接続（status→'online'）時にメモ／ノート／タグの React Query クエリを invalidate / refetch する」こと。これは新端末やキャッシュ削除後のユーザーが初回ロードで一覧が空に見える実 UX バグの是正でもある。設計レビューで再接続時 refetch の副作用（再接続多発環境での API 負荷、過剰な再描画、React Query onlineManager と独自 useNetworkStatusStore の連動方法）を検討すること。

【非機能・制約】frontend/** および e2e spec の変更は deploy-frontend-prod.yml（frontend/** トリガー）を起動して本番フロントデプロイを誘発する点に留意。CI seed step は pwa-perf.yml 内（アプリコードに依存しない形を維持）。ローカル反復は隔離 DB mosaku_e2e + alt ポート（backend:3100 / preview:4173）で実施し dev 環境・dev DB を汚さない。

【対象外】既に解決済みの env 欠落・throttle・seed 導入（commit 済み）、editor/sync 以外の広範な E2E 書き換え、PWA オフライン同期エンジン自体の再設計。

## Introduction

本仕様は、`.github/workflows/pwa-perf.yml` の e2e ジョブを完全に緑化することをゴールとする。直近の修正（env 変数・throttle 緩和・test 管理者 seed）で 0→29 passed まで改善したが、editor/sync 系の残り約 12 件が依然 RED である。ローカル隔離環境での診断により、残りの失敗は (1) seed ユーザーのオンボーディング未完、(2) E2E の認証セットアップ方式、(3) 初期ビューがホームに変わったことによる導線、(4) **ネットワーク再接続時にサーバー状態が再取得されないアプリ本体のバグ** の 4 連鎖に集約されることが実証済みである。

特に (4) は「新端末やキャッシュ削除直後のユーザーが初回ロードで一覧を空のまま見続ける」という実 UX バグであり、テスト修正では解消できない。本仕様はこのアプリ本体のバグ是正を中核に据え、併せて E2E スイートを緑化することで「正しさをテストで固定する」状態を達成する。

## Requirements

### Requirement 1: ネットワーク再接続時のサーバー状態再取得（アプリ本体のバグ是正）

**Objective:** As a 新端末やキャッシュ削除直後の利用者, I want オンライン接続が確立した時点でメモ・ノート・タグの一覧、およびログイン直後に着地するホームダッシュボードの最近メモが自動で最新化されること, so that 着地直後のホームを含め空の一覧を見続けることなく自分のデータにアクセスできる

#### Acceptance Criteria

1. When ネットワーク状態が `online` 以外（`unstable` / `offline`）から `online` に遷移したとき, the Network Sync Module shall メモ・ノート・タグ、およびホームダッシュボードの最近メモ（`dashboard.recentMemos`）のサーバー状態クエリを再取得（invalidate / refetch）する。
2. While ネットワーク状態が `online` でないとき, the Memo Data Module shall ローカル（IndexedDB）由来の結果のみを返し、空結果をネットワーク取得済みの確定値として固定しない。
3. When ローカルが空の状態でオンライン接続が確立したとき, the Memo Data Module shall サーバーへ一覧取得リクエストを発行し、取得結果で一覧を更新する。
4. If ネットワーク再接続が短時間に複数回発生したとき, then the Network Sync Module shall 再取得リクエストが過剰に多重発行されないよう抑制する。
5. The Network Sync Module shall 既存のオフライン同期エンジンの責務（ローカル優先・キュー同期）を変更せず、再接続時の再取得のみを追加する。

### Requirement 2: E2E 認証セットアップ（ブラウザコンテキスト経由ログイン）

**Objective:** As a E2E テストスイート, I want ブラウザコンテキスト経由でログインしてログイン状態を確実に確立すること, so that 起動時の自動リフレッシュが成功し、各 spec が認証済みで開始できる

#### Acceptance Criteria

1. When 認証が必要な spec のセットアップを実行するとき, the E2E Auth Helper shall ブラウザコンテキスト経由（`context.request.post('/auth/login')`）でログインし、HttpOnly の refresh cookie をコンテキストに保存する。
2. When 認証済みコンテキストでアプリを起動したとき, the Application shall 起動時の `/auth/refresh` が成功し、ログイン状態を復元する。
3. If localStorage への access token 注入のみでログイン状態を確立しようとしたとき, then the E2E Auth Helper shall その方式に依存しない（起動時 refresh 失敗で token が消去されるため）。
4. The E2E Auth Helper shall 認証セットアップを共有ヘルパーとして提供し、対象 spec が重複実装せず再利用できるようにする。

### Requirement 3: CI seed ユーザーのオンボーディング完了

**Objective:** As a E2E テスト実行環境, I want seed される test ユーザーがオンボーディング完了済みであること, so that OnboardingModal が前面に出てクリックを遮らず操作が成立する

#### Acceptance Criteria

1. When CI の seed step が test 管理者ユーザーを作成するとき, the CI Seed Step shall 当該ユーザーの `onboardingCompleted` を `true` として設定する。
2. While 認証済みでアプリを表示しているとき, the Application shall OnboardingModal を前面に表示せず、画面操作を妨げない。
3. The CI Seed Step shall アプリケーションコードに依存しない形（`pwa-perf.yml` 内の Prisma seed）を維持する。

### Requirement 4: メモ一覧への遷移ヘルパー（初期ビュー変更への追従）

**Objective:** As a E2E テストスイート, I want ログイン後にメモ一覧へ確実に遷移する共有ヘルパーを持つこと, so that 初期ビューがホームダッシュボードに変わってもメモ前提の spec が成立する

#### Acceptance Criteria

1. When ログイン後の初期ビューがホームダッシュボードであるとき, the E2E Navigation Helper shall ヘッダーの「メモ」ボタン（`getByRole('button', { name: 'メモ', exact: true })`）を操作してメモ一覧へ遷移する。
2. When メモ一覧への遷移を要求されたとき, the E2E Navigation Helper shall メモ一覧ビューが表示されたことを確認してから後続操作へ進む。
3. The E2E Navigation Helper shall この遷移を共有ヘルパーとして提供し、editor/sync 系 spec が再利用できるようにする。

### Requirement 5: E2E スイートの完全緑化と回帰防止

**Objective:** As a 開発チーム, I want pwa-perf.yml の e2e ジョブが全件パスすること, so that PWA editor/sync の正しさをテストで固定し回帰を検知できる

#### Acceptance Criteria

1. When `pwa-perf.yml` の e2e ジョブを実行したとき, the E2E Suite shall 残り約 12 件（markdown-editor / prose-typography / slash-command / train-scenario / feedback 系）を含む全 spec をパスする。
2. When fresh なブラウザコンテキスト（空の IndexedDB）で editor/sync spec を実行したとき, the E2E Suite shall メモ一覧が再接続後にサーバー状態で満たされることを前提に成立する。
3. If 本仕様で修正対象外の既存パス済み spec（29 件）に影響が及んだとき, then the E2E Suite shall それらを引き続きパスし、回帰を発生させない。

### Requirement 6: 変更スコープと隔離環境の制約

**Objective:** As a 開発者, I want 本仕様の変更がデプロイ・dev 環境へ与える影響を制御すること, so that 意図しない本番デプロイや dev 環境汚染を避けられる

#### Acceptance Criteria

1. Where `frontend/**` または e2e spec を変更する場合, the Change shall それが `deploy-frontend-prod.yml`（`frontend/**` トリガー）を起動し本番フロントデプロイを誘発しうる点を考慮したうえで実施する。
2. While ローカルで E2E を反復実行するとき, the Development Process shall 隔離 DB `mosaku_e2e` と代替ポート（backend:3100 / preview:4173）を用い、dev 環境・dev DB を汚さない。
3. The Spec shall 既に解決済みの env 欠落・throttle 緩和・test 管理者 seed 導入（commit 済み）を再実装の対象外とする。
4. The Spec shall PWA オフライン同期エンジン自体の再設計、および editor/sync 以外の広範な E2E 書き換えを対象外とする。

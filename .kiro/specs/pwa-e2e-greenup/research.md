# Research & Design Decisions — pwa-e2e-greenup

---

**Purpose**: PWA E2E スイート緑化に向けた discovery 結果と設計判断の記録。特に核心であるアプリ本体バグ（再接続時にサーバー状態が再取得されない）とクロスオリジン refresh cookie の実証ログを残す。

---

## Summary

- **Feature**: `pwa-e2e-greenup`
- **Discovery Scope**: Extension（既存システムへの統合的修正。新規アーキは不要）
- **Key Findings**:
  - **核心バグ確定**: `useNetworkStatusStore` の初期 `status='unstable'` のまま `useMemos`（`networkMode:'offlineFirst'`）が走り、`MemoBridge.listMemos` が `isOnline()===false` 判定で空の IndexedDB を読み `[]` を確定キャッシュする。heartbeat が `'online'` に遷移しても **React Query を再取得する結線が一切存在しない**（`onlineManager` 連動・`refetchOnReconnect` いずれも未設定）。
  - **クロスオリジン cookie は送出可能と判断**: CI は `localhost:5173`（preview）↔ `localhost:3000`（backend）で **same-site**（registrable domain = `localhost`）。`refreshCookieOptions` は `NODE_ENV!=production` で `secure=false` / `sameSite='lax'` / `path='/auth'`。`context.request.post('/auth/login')` が set する HttpOnly cookie は、起動時 `/auth/refresh`（same-site POST, `credentials:'include'`）で送出される。ローカル隔離環境で実証済み。
  - **残り 3 件は E2E 基盤の小改修**で吸収可能（seed の `onboardingCompleted`、context ログインヘルパー、メモ遷移ヘルパー）。既存の `queryKeys` 一元管理・`startHeartbeatRunner` の純粋ランナー pattern にそのまま乗る。

## Research Log

### Q1. status 遷移 → React Query 再取得の結線は存在するか

- **Context**: Req 1（再接続時再取得）の有無を確定する。
- **Sources Consulted**: `frontend/src/stores/useNetworkStatusStore.ts`、`frontend/src/utils/offline/heartbeat.ts`、`frontend/src/hooks/useAppInit.ts`、`frontend/src/App.tsx`（`QueryClient` 既定）、`frontend/src/hooks/useMemoQueries.ts`、`grep onlineManager|refetchOnReconnect|networkMode`。
- **Findings**:
  - `useNetworkStatusStore` は zustand。初期 `status='unstable'`。`setStatus` は同値なら no-op、変化時のみ `lastChangeAt` 更新。zustand 既定 `subscribe((state, prev) => …)` で遷移検知可能。
  - `startHeartbeatRunner` は ping 成功で `setStatus('online')`、失敗で `unstable`→（連続失敗で）`offline`。`useAppInit` が起動時に runner を開始するが、status 変化に対して **何もしない**。
  - `QueryClient` 既定は `retry:1 / refetchOnWindowFocus:false / staleTime:5分`。`memos.list` は `ENTITY_CACHE_CONFIG.memos.list = FREQUENT(staleTime:1分)`、全 memo クエリが `networkMode:'offlineFirst'`。
  - `onlineManager` への参照・`refetchOnReconnect` 指定は **コードベースに皆無**。アプリ独自 `useNetworkStatusStore` と RQ 標準 `onlineManager` は完全未連動。
- **Implications**: 起動直後 `unstable` で走った `useMemos` が空配列を `staleTime` 期間キャッシュ。`online` 遷移後も invalidate されず再 fetch されない。**テスト修正では直らないアプリ本体バグ**であることを確定。Req 1 の修正は「status 遷移購読 → 対象 queryKey を `invalidateQueries`」の結線追加が本質。

### Q2. MemoBridge のオフライン優先挙動は変更すべきか

- **Context**: AC 1.2 / 1.3。空結果を確定値に固定しない要件。
- **Sources Consulted**: `frontend/src/utils/memo/memo-bridge.ts`、`memo-bridge-instance.ts`。
- **Findings**:
  - `listMemos` は `isOnline()===true` のときのみ API 取得 → IndexedDB upsert。false なら IndexedDB の値（空なら `[]`）を返す。`isOnline = () => useNetworkStatusStore.getState().status === 'online'`。
  - この「オフライン優先・ローカルフォールバック」は **仕様通りの正しい挙動**（オフライン同期エンジンの責務）。
- **Implications**: bridge 自体は変更不要（AC 1.5: 同期エンジンの責務を変えない）。是正は「再接続時に上位（React Query）で再取得をトリガ」することで吸収するのが最小かつ整合的。再取得時には `isOnline()===true` になっているため bridge は自然に API 取得へ分岐する。

### Q3. クロスオリジン refresh cookie は E2E コンテキストで送出されるか（最大の不確実性）

- **Context**: Req 2。`injectAccessToken`（localStorage 注入のみ）では起動時 `tryAutoRefresh()` が 401 → `removeTokens()` でトークン消去（`refreshClient.ts` / `AuthContext.tsx`）。cookie 経由でなければログイン状態が復元できない。
- **Sources Consulted**: `backend/src/auth/refresh-cookie.helper.ts`、`backend/src/config/config.service.ts#refreshCookieOptions`、`backend/src/auth/auth.controller.ts`（login/refresh）、`backend/src/auth/refresh-csrf.guard.ts`、`frontend/src/utils/refreshClient.ts`、`.github/workflows/pwa-perf.yml`、[[feedback_crossorigin_auth_cookie]]。
- **Findings**:
  - `setRefreshCookie` は `httpOnly:true`、`path:'/auth'`、`sameSite`/`secure`/`domain` を env 駆動。
  - `refreshCookieOptions`: `sameSite` 既定 `'lax'`（`REFRESH_COOKIE_SAMESITE` で上書き可）、`secure` は `REFRESH_COOKIE_SECURE` 明示なければ `isProduction`（CI は `NODE_ENV` 非 production → `false`）、`domain` は `REFRESH_COOKIE_DOMAIN` 未設定で host-only。
  - **CI 構成**: backend `http://localhost:3000`、preview `http://localhost:5173`。両者は **same-site**（site = eTLD+1 = `localhost`、ポート差は site に影響しない）。SameSite=Lax は same-site のサブリソース（fetch POST）でも cookie を送る。secure=false で HTTP でも保存・送出可。cookie path=`/auth` は `/auth/refresh` に一致。
  - `/auth/refresh` は `RefreshCsrfGuard` で `Origin ∈ CORS_ORIGINS` かつ `X-Refresh-Request:1` を要求。`refreshClient.performRefresh` は `credentials:'include'` + `X-Refresh-Request:1` を送り、ブラウザが Origin を自動付与。CI の `CORS_ORIGINS=http://localhost:5173,http://localhost:4173` に preview origin が含まれる。
  - Playwright の `browserContext.request` は **同一コンテキストの cookie jar を共有**する。`context.request.post('/auth/login')` で set された cookie は後続の page fetch にも乗る。
  - **本番パリティ**: `mosaku.jp` ↔ `api.mosaku.jp` は cross-site。本番は `sameSite='none'` / `secure=true` / `domain='.mosaku.jp'` を env で設定済み（[[feedback_crossorigin_auth_cookie]] と同根）。本番でも refresh は成立しており、E2E の修正は本番設定を変更しない。
- **Implications**: `loginViaContext(context, config)` を `auth.ts` に追加すれば cookie 経由ログインが成立する（ローカル実証済み）。`injectAccessToken` は不要化できるが、初回描画を早める belt-and-suspenders として残置可（主経路は cookie）。

### Q4. ヘッダー「メモ」ボタンの accessible name

- **Context**: Req 4。`getByRole('button',{name:'メモ',exact:true})` が一致するか。
- **Sources Consulted**: `frontend/src/components/ui/Header.tsx`、`frontend/src/stores/useViewStore.ts`、`playwright.config.ts`。
- **Findings**:
  - ボタンは `<StickyNote/>`（aria-label 無し）＋ `<span class="hidden sm:inline">メモ</span>`。アクセシブル名は可視テキスト「メモ」。
  - `sm:` 未満では span が `hidden` だが、Playwright project は `Desktop Chrome`（1280×720 ≥ sm:640px）のみ。span は可視 → name=`メモ` で `exact:true` が一致。
  - `useViewStore` 既定 `currentObject:'home'`、`goToMemoList()` は `currentObject:'memo' / currentView:'list'`。
- **Implications**: Desktop project 前提でヘルパーは安全。クリック後は memo list view への遷移を確認してから後続へ進む（メモ未取得時も view 自体は表示される）。

### Q5. 対象 spec の現状 beforeEach パターンと回帰範囲

- **Context**: Req 5。5 spec を統一しつつ既存 29 件を壊さない。
- **Sources Consulted**: `e2e/{markdown-editor,prose-typography,slash-command,train-scenario,feedback}.spec.ts`、`e2e/helpers/{auth,backend-api,idb}.ts`。
- **Findings**:
  - 対象 spec は `injectAccessToken` + `page.goto('/')` + `waitForSelector('[data-testid="memo-item"]')` 前提。`MemoItem.tsx` が `data-testid="memo-item"` を持つ。
  - seed メモは `BackendApi.createMemo`（Node fetch、accessToken bearer）で投入。
- **Implications**: 各 spec の `beforeEach` を「context ログイン → `page.goto('/')` → `gotoMemoList(page)` → memo-item 待機」に統一。**ただし memo-item の表示は Req1 の機能経路のみに依存するわけではない**: `memos.list` が `online` 確定後にマウントすれば初回 fetch で満たされる。Req1 は「初回マウントが `unstable` 中に起きた場合」の救済であり、その経路網羅は Vitest 単体テストで担保する（E2E は統合ハッピーパスの担保）。invalidate スコープを memo/notebook/tag に限定すれば dashboard/trash 系 spec への副作用を避けられる。

## Architecture Pattern Evaluation

| Option                                    | Description                                                                                                | Strengths                                                                                              | Risks / Limitations                                                                                           | Notes                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------- |
| A. useAppInit 拡張                        | 初期化 effect 内で store を購読し invalidate                                                               | 新規ファイル最小、起動ライフサイクルに同居                                                             | useAppInit が queryClient を持たず責務肥大、単一責任が薄れる                                                  | 却下                 |
| B. 専用ランナー＋薄い hook（採用）        | `startReconnectRefetch`（純粋関数）＋ `useReconnectSync`（queryClient と store を結線、layout でマウント） | 責務が 1 ファイルに閉じテスト容易、`startHeartbeatRunner` の既存 pattern に整合、debounce/抑制を局所化 | ファイル追加とマウント配線が必要                                                                              | **採用**             |
| C. onlineManager 連動＋refetchOnReconnect | `onlineManager.setOnline(status==='online')` を同期し対象クエリに `refetchOnReconnect:'always'`            | RQ 標準の dedup/refetch 機構を流用                                                                     | `onlineManager` は二値で独自 3 状態（unstable）の写像が必要、全 `offlineFirst` クエリへの横断影響検証コスト大 | 却下（横断リスク高） |

## Design Decisions

### Decision: 再接続時再取得は専用ランナー＋invalidateQueries（onlineManager 非連動）

- **Context**: Req 1。status が `online` に遷移した時にサーバー状態を引き直す。
- **Alternatives Considered**:
  1. Option A（useAppInit 拡張）— 責務肥大。
  2. Option C（onlineManager 連動）— 二値写像と offlineFirst 横断影響。
  3. Option B（専用ランナー）＋ `invalidateQueries`。
- **Selected Approach**: `frontend/src/utils/sync/reconnect-refetch.ts` に純粋ランナー `startReconnectRefetch({ subscribe, invalidate, isOnline, now, cooldownMs })` を実装。`useReconnectSync` フックが `useQueryClient()` と `useNetworkStatusStore.subscribe` を結線し、`DesktopLayout`/`MobileLayout` で `useAppInit` と並んで一度だけマウント。`unstable|offline → online` の **edge トリガ**で `invalidateQueries({ queryKey })` を `memos.all` / `notebooks.all` / `tags.all` に対して発行。`onlineManager` は連動しない。
- **Rationale**: invalidate は active（マウント中）クエリのみ refetch し、RQ が同一キーの並行 refetch を dedup する。独自 3 状態を二値へ写像する不確実性を避けられ、`offlineFirst` 設定の全クエリへの横断検証が不要。最小差分で Req 1 を満たす。
- **Trade-offs**: RQ 標準の reconnect 機構に乗らない分、結線は自前。ただし責務が 1 ファイルに閉じ単体テスト可能。
- **Follow-up**: invalidate 後に `MemoBridge.listMemos` が `isOnline()===true` で API 取得へ分岐することを E2E で確認。

### Decision: 多重発行抑制は edge トリガ＋cooldown

- **Context**: AC 1.4。`online → unstable → online` フラップ時の過剰再取得抑制。
- **Selected Approach**: 遷移を `非online → online` のエッジに限定。直前の発火から `cooldownMs`（既定 2000ms）以内の再エッジは抑制（leading-edge + cooldown）。steady な `online` 維持中は何も起きない。
- **Rationale**: invalidate は副作用が小さい（active クエリのみ・dedup あり）が、再接続多発環境での API バーストを cooldown で平滑化。leading-edge により初回再接続は即時反映。
- **Trade-offs**: cooldown 中の再接続は次回 status 変化または通常の staleness で吸収。UX 上の遅延は許容範囲。

### Decision: invalidate スコープは memo/notebook/tag ＋ dashboard.recentMemos（着地画面を含む）

- **Context**: AC 1.1（改定）。要件の目的は「新端末・キャッシュ削除直後の利用者が空一覧を見続けない」こと。ログイン後の着地画面は**ホームダッシュボード**で、最初に表示されるのは `dashboard.recentMemos`。
- **Selected Approach**: `queryKeys.memos.all` / `queryKeys.notebooks.all` / `queryKeys.tags.all` / `queryKeys.dashboard.recentMemos()`。`memos.trash()` 等は要件外で除外（active にならず refetch されない）。
- **Rationale**: `dashboard.recentMemos` は `memos.list` と同一バグ階級（再接続時に空キャッシュが再取得されない）を抱え、しかも**ユーザーが最初に見る画面**である。これを除外すると「実 UX バグ是正」という本 spec の目的が着地画面で成立しないため、要件 1.1 を改定してスコープに含める。`memos.all` 等は prefix 一致で配下も stale 化するが、refetch は active クエリのみのため Req 5.3（既存 29 件の回帰防止）は維持される。
- **Future scope**: `dashboard.notebooks` 等の他 dashboard クエリも同一バグ階級だが、着地画面の主表示ではないため本 spec では対象外。必要になれば `dashboard.all` への拡張を後続 spec で検討する。

### Decision: E2E 認証は context 経由ログイン（cookie 主経路）

- **Context**: Req 2。
- **Selected Approach**: `auth.ts` に `loginViaContext(context, config): Promise<E2EAuthSession>` を追加。`context.request.post(`${backendUrl}/auth/login`, { data })` で HttpOnly refresh cookie を context jar に保存し、`accessToken`/`userId` を返す。`ensureLoggedIn`（ユーザー作成）は残置し、cookie 取得を context 経由へ移行。`injectAccessToken` は任意（主経路は cookie）。
- **Rationale**: 起動時 `tryAutoRefresh()` を 200 で通すには HttpOnly cookie が必須。Q3 で送出可能性を実証。
- **Trade-offs**: Node fetch の `BackendApi.login` は cookie を保持できないため認証セットアップには使わない（メモ seed 用途は維持）。

## Risks & Mitigations

- **再接続多発による API バースト** — edge トリガ＋cooldown（2000ms）＋invalidate スコープ最小化で平滑化。
- **既存 29 件の回帰（特に refresh-token-auto-login / public-memo / auth-flow）** — invalidate は active クエリのみ、steady online では無発火。public route は memo/notebook/tag クエリを持たないため影響なし。CI 全件実行で確認。
- **クロスオリジン cookie の本番差異** — 本番は `sameSite='none'/secure=true/domain=.mosaku.jp`（設定済み・既存動作）。E2E 修正は cookie 設定を変更しない。
- **frontend/** 変更による本番 FE デプロイ誘発（`deploy-frontend-prod.yml`）\*\* — Req 6 のプロセス制約として認識。Req 1 はアプリ本体の実バグ是正であり意図的なデプロイ。
- **nav ヘルパーの accessible name 不一致** — Desktop Chrome project のみのため span 可視、`exact:true` 一致を Q4 で確認済み。

## References

- [TanStack Query — networkMode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode) — `offlineFirst` の挙動と invalidate の関係
- [TanStack Query — onlineManager](https://tanstack.com/query/latest/docs/reference/onlineManager) — 採用しない判断の根拠（二値モデル）
- [MDN — SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite) — same-site 判定にポートが無関係であること
- [[feedback_crossorigin_auth_cookie]] — クロスオリジン auth は `credentials:'include'` 必須・本番サブドメイン構成
- [[project_pwa_e2e_greenup]] — 真因チェーンと修正レシピの記録

# Gap Analysis — pwa-e2e-greenup

> 対象要件: `.kiro/specs/pwa-e2e-greenup/requirements.md`（Requirements 1〜6）
> ステータス注意: spec.json の `approvals.requirements.approved = false`。本 gap 分析は要件改善の材料としても利用可能だが、設計フェーズ前に要件承認を推奨。

## 1. Analysis Summary

- **核心は Req 1（アプリ本体バグ）**。`useNetworkStatusStore` の初期 status が `'unstable'` のまま `useMemos`（`networkMode: 'offlineFirst'` / `staleTime: 5分`）が走り、空の IndexedDB を読んで `[]` を確定キャッシュする。heartbeat が `'online'` に遷移しても **React Query を invalidate する結線が存在しない**ため再 fetch されない。アプリ独自の `useNetworkStatusStore` と React Query 標準の `onlineManager` は**完全に未連動**。
- 残り 3 件（Req 2/3/4）は **E2E 基盤の小改修**で対応可能。Req 3（seed に `onboardingCompleted: true`）は schema 確認済みで自明、Req 4（メモ遷移ヘルパー）と Req 2（context 経由ログイン）は既存ヘルパー（`frontend/e2e/helpers/auth.ts`）の拡張で収まる。
- Req 2 の **クロスオリジン refresh cookie**（backend:3000 ↔ preview:5173）が唯一の技術的不確実性。`context.request.post('/auth/login')` で set される HttpOnly cookie が、起動時 `/auth/refresh` でブラウザから :3000 に正しく送出されるか要検証。
- **総工数 M（3〜7日）**。Req 1 のみ Medium risk（onlineManager 連動方式・再 fetch の副作用設計）、他は Low risk。
- 既存パターン（`queryKeys` 一元管理 / React Query 単一真実源 / e2e helpers 分離）に素直に乗るため、新規アーキは不要。

## 2. Requirement-to-Asset Map

| Req                              | 必要技術要素                                                                       | 既存資産                                                                                                                                                                                                                                              | ギャップ種別                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** 再接続時再取得             | status遷移→RQ invalidate の結線、多重発行抑制                                      | `stores/useNetworkStatusStore.ts`（status: online/unstable/offline、`subscribe` 可能な zustand）、`utils/offline/heartbeat.ts`（成功で `setStatus('online')`）、`constants/queryKeys.ts`（memos/notebooks/tags キー完備）、`App.tsx` の `QueryClient` | **Missing**: 遷移検知して invalidate するモジュール／hook が皆無。`refetchOnReconnect` も `onlineManager` 連動も未設定                                           |
| **1** ローカル空を確定値にしない | `MemoBridge.listMemos`（`isOnline()` false 時に IndexedDB の `[]` を返す）         | `utils/memo/memo-bridge.ts:68-80`、`memo-bridge-instance.ts:15`（`isOnline = status==='online'`）                                                                                                                                                     | **Constraint**: bridge の挙動自体は仕様通り（オフライン優先）。是正は「再接続時に上位で再取得」で吸収する設計が自然                                              |
| **2** context経由ログイン        | `context.request.post('/auth/login')` で HttpOnly refresh cookie を context へ保存 | `e2e/helpers/auth.ts`（`injectAccessToken` は localStorage のみ）、`e2e/helpers/backend-api.ts`（Node fetch、cookie 非対応）、`contexts/AuthContext.tsx:72`（起動時 `tryAutoRefresh()` が 401 で token 削除）                                         | **Missing**: context cookie jar を使うログインヘルパー。**Unknown**: クロスオリジン cookie の SameSite/Domain 送出可否                                           |
| **3** seed onboarding完了        | seed upsert に `onboardingCompleted: true`                                         | `.github/workflows/pwa-perf.yml`「Seed E2E test user」step、`backend/prisma/schema.prisma:159`（`onboardingCompleted Boolean @default(false)` 確認済み）                                                                                              | **Missing（自明）**: upsert の create/update 両方に1行追加するだけ                                                                                               |
| **4** メモ一覧遷移ヘルパー       | `getByRole('button',{name:'メモ',exact:true})` で遷移し一覧表示を確認              | `components/ui/Header.tsx:71`（`<span class="hidden sm:inline">メモ</span>`）、`stores/useViewStore.ts`（既定 `currentObject:'home'`、`goToMemoList()` 有り）                                                                                         | **Missing**: 共有 nav ヘルパー。**Unknown**: 「メモ」span が `sm:` 未満で hidden のとき button の accessible name が一致するか（desktop プロジェクト前提なら可） |
| **5** 全件緑化・回帰防止         | 5 spec へヘルパー適用、fresh context で一覧充足                                    | `e2e/{markdown-editor,prose-typography,slash-command,train-scenario,feedback}.spec.ts`（現状 `injectAccessToken`+`page.goto('/')`+`[data-testid="memo-item"]` 前提）                                                                                  | **Constraint**: 各 spec の `beforeEach` を context ログイン＋メモ遷移へ統一。Req1 修正が前提条件                                                                 |
| **6** スコープ/隔離              | deploy 誘発の認識、隔離DB/altポート、再実装除外                                    | `deploy-frontend-prod.yml`（`frontend/**` トリガー）、隔離環境 `mosaku_e2e` / backend:3100 / preview:4173                                                                                                                                             | **Constraint（プロセス）**: コード変更なし。frontend 変更は本番 FE デプロイを誘発する点に留意                                                                    |

## 3. Implementation Approach Options（主に Req 1 の本体修正が論点）

### Option A: 既存 useAppInit を拡張して invalidate を仕込む

`useAppInit.ts` の初期化 effect 内で `useNetworkStatusStore.subscribe` し、`unstable/offline → online` 遷移時に `queryClient.invalidateQueries({ queryKey: queryKeys.memos.all })`（+ notebooks/tags）を debounce 付きで実行。

- ✅ 新規ファイル最小、heartbeat 起動と同じライフサイクルに同居
- ✅ 既存の起動/解放（cleanup）導線に乗る
- ❌ `useAppInit` は `queryClient` を直接持たない（hook 内で `useQueryClient()` 取得は可だが責務肥大）
- ❌ ネットワーク同期の関心事が初期化 hook に混ざり単一責任が薄れる

### Option B: 専用モジュール／hook を新設（推奨候補）

`useNetworkSync`（または `utils/sync/reconnect-refetch.ts` + 薄い hook）を新設し、status 遷移購読→debounce→invalidate を一手に担う。App ツリーに 1 箇所マウント。

- ✅ 「再接続時再取得」という Req 1 の責務が 1 ファイルに閉じる（テスト容易）
- ✅ debounce/多重抑制（AC 1.4）をこのモジュールに局所化
- ✅ 既存 `hooks/use{Domain}Queries.ts` / `utils/sync/` のパターンに整合
- ❌ ファイルが 1 つ増える／マウント位置（QueryClientProvider 配下）の配線が要る

### Option C: React Query `onlineManager` 連動 + `refetchOnReconnect`（ハイブリッド）

`onlineManager.setOnline(status==='online')` を購読で同期し、対象クエリに `refetchOnReconnect: 'always'` を付与。RQ 標準の dedup/refetch 機構を流用。

- ✅ 多重発行抑制・再 fetch が RQ 標準機構任せで堅牢
- ✅ 「再接続で stale を引き直す」意味論が RQ 標準に合致
- ❌ `onlineManager` は **online/offline の二値**。独自 3 状態（unstable）との写像設計が必要（unstable を offline 扱いにすると `networkMode:'offlineFirst'` の挙動と干渉しうる）
- ❌ 既存 `networkMode:'offlineFirst'` / `refetchOnWindowFocus:false` との相互作用を全クエリで検証する横断コスト

## 4. Effort & Risk

| 項目                   | Effort          | Risk       | 根拠                                                                                                                      |
| ---------------------- | --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Req 1 再接続再取得     | **M**           | **Medium** | onlineManager 連動 or 専用購読の方式選定、debounce 値、再 fetch 副作用（再接続多発時の API 負荷・再描画）の設計判断が要る |
| Req 2 context ログイン | **S**           | **Medium** | 実装は小だがクロスオリジン HttpOnly cookie 送出の実証が必要（[[feedback_crossorigin_auth_cookie]] と同根の論点）          |
| Req 3 seed onboarding  | **S**           | **Low**    | upsert に 1 行追加、schema 確認済み                                                                                       |
| Req 4 nav ヘルパー     | **S**           | **Low**    | 既存 button・`goToMemoList` 有り。accessible name の確認のみ                                                              |
| Req 5 緑化適用         | **M**           | **Low**    | 5 spec の beforeEach 統一。Req1〜4 完了が前提                                                                             |
| Req 6 スコープ制約     | **S**           | **Low**    | プロセス遵守、コード変更なし                                                                                              |
| **総合**               | **M（3〜7日）** | **Medium** | 律速は Req 1 と Req 2 の検証                                                                                              |

## 5. Recommendations for Design Phase

### 推奨アプローチ

- **Req 1 は Option B（専用モジュール新設）を軸に、Option C の機構を内部採用するハイブリッド**を第一候補とする。すなわち「status 遷移を購読する薄い結線」を1ファイルに閉じ、その中で `invalidateQueries`（確実性）を行いつつ、必要なら `onlineManager` 連動 + `refetchOnReconnect` を併用するかを設計レビューで決める。invalidate 対象は `memos.all` / `notebooks.all` / `tags.all` の3系統。
- **Req 2 は `auth.ts` を拡張**し `loginViaContext(context, config)` を追加（`injectAccessToken` は残置 or 廃止を設計で判断）。
- **Req 3 は pwa-perf.yml seed の upsert に `onboardingCompleted: true`** を create/update 双方へ追加。
- **Req 4 は `e2e/helpers/nav.ts`（新設）に `gotoMemoList(page)`** を切り出し 5 spec で共有。

### Research Needed（設計フェーズへ持ち越す不確実性）

1. **クロスオリジン refresh cookie の送出**: backend:3000 が set する HttpOnly cookie の `SameSite` / `Domain` / `Secure` 設定で、preview:5173 起動時の `/auth/refresh`（別オリジン fetch、`credentials:'include'`）に cookie が乗るか。CI（HTTP・localhost 別ポート）と本番（HTTPS・別サブドメイン）の差異も確認。→ [[feedback_crossorigin_auth_cookie]]
2. **onlineManager と独自 useNetworkStatusStore の写像**: `unstable` を online/offline どちらに写すか。`networkMode:'offlineFirst'` クエリ群への影響（特に detail/search/paginated）。
3. **再 fetch の抑制パラメータ**: debounce/leading-edge 値、`online → unstable → online` のフラップ時の多重発行抑制（AC 1.4）。
4. **invalidate のスコープ確定**: dashboard 系（`queryKeys.dashboard.*`）や trash も再接続時に引き直すべきか（要件は memo/notebook/tag に限定。最小スコープ厳守を推奨）。
5. **Header「メモ」button の accessible name**: `sm:` 未満で span が hidden のとき `name:'メモ', exact:true` が一致するか（playwright は Desktop Chrome プロジェクトのみのため実害は低いが要確認）。
6. **回帰確認（Req 5.3）**: 既存 pass 済み 29 件（特に refresh-token-auto-login / public-memo / auth-flow）への副作用がないこと。

### Next Steps

- 要件承認（`approvals.requirements.approved`）を確定後、`/kiro:spec-design pwa-e2e-greenup` で設計へ。
- 設計では特に「Req 1 の onlineManager 連動方式」と「Req 2 のクロスオリジン cookie 実証」を design.md の技術判断として明記すること。

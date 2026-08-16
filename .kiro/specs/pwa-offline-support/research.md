# Research & Design Decisions — PWA Offline Support

---

## Summary

- **Feature**: `pwa-offline-support`
- **Discovery Scope**: Complex Integration（既存 SPA + React Query + autosave + Sentry の構造を尊重しつつ、永続層・同期層・SW 層を新規で挿入する横断的拡張）
- **Key Findings**:
  - `vite-plugin-pwa@1.0.3` は既に導入済みで Manifest と Workbox 設定が存在する。ただし現状の `runtimeCaching` は `/api/*` を `NetworkFirst` でキャッシュしており、Requirement 9.4（認証必須 API を SW キャッシュから除外）と矛盾する。SW 設計の見直しが必須。
  - メモ件数は既定 200 件・上限 50 MB と十分小さく、`idb`（~10 KB、Promise ベース、型サポート）で素朴に実装すれば全件線形スキャンによる検索でも 300 ms 目標（Requirement 5.2）を満たせるため、Dexie.js などの DSL 付きライブラリは不要。
  - last-write-wins の判定をサーバー側に持たせる必要があるため、`PATCH /memos/:id` に `clientUpdatedAt` 受信ロジックを追加し、サーバー保持の `updatedAt` が新しい場合は 409 + 現在表現を返す方針が、既存 React Query キャッシュ更新フローとの整合性が最も良い。

## Research Log

### IndexedDB アクセスライブラリの選定

- **Context**: メモ 200 件 + 保留キュー（数十件想定）の永続化と検索を行うため、IndexedDB の素の API を使うか軽量ラッパーを使うかを決める。
- **Sources Consulted**: `idb` (jakearchibald/idb v8 README), `Dexie.js` (dexie.org docs), `localforage` v1.10 README, MDN IndexedDB ガイド。
- **Findings**:
  - `idb` は Promise ベースの薄いラッパー（min+gzip ~3 KB）。トランザクション・カーソル・バージョンアップを直接的に扱える。
  - `Dexie.js` はクエリ DSL とリアクティブな live query を提供するが、min+gzip ~24 KB でバンドル肥大化が大きい。本機能はキー検索 + 全件スキャンしか必要としないため過剰。
  - `localforage` は KV ストア抽象で IndexedDB の二次インデックスを失うため、`updatedAt` 順スキャンや `userId` フィルタを効率化できない。
- **Implications**:
  - 採用は **`idb`**。`memos` ストアは `keyPath: 'id'` + `userId` / `updatedAt` インデックス、`pending_operations` は `autoIncrement: true` + `memoId` インデックスで実装。
  - メタデータ用の `meta` ストア（最終同期日時・current user id 等）も同 DB 内に配置し、データベース名は `mosaku-offline` にバージョン番号で管理する。

### Service Worker 戦略の再構築

- **Context**: 現在の `vite.config.ts` は `runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkFirst' }]` を持ち、認証付き API レスポンスを SW Cache Storage に書き込んでしまう。Requirement 9.4 と矛盾。
- **Sources Consulted**: vite-plugin-pwa v1 公式ドキュメント (vite-pwa-org.netlify.app), Workbox v7 strategies (developer.chrome.com/docs/workbox)。
- **Findings**:
  - `vite-plugin-pwa` の `registerType` は `autoUpdate` / `prompt` を選択可能。`prompt` + `virtual:pwa-register/react` の `useRegisterSW` を組み合わせると、`onNeedRefresh` でユーザーへ更新通知 → `updateServiceWorker(true)` で安全に有効化できる（Requirement 1.6）。
  - app shell プリキャッシュは `globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}', 'themes/*.css']` で十分。テーマ CSS は遅延キャッシュにしたい（Requirement 8.3）ため、`themes/*.css` のみ runtime `CacheFirst` に分離する。
- **Implications**:
  - `runtimeCaching` から `/api/*` のエントリを削除し、API 通信はアプリ層（IndexedDB）で完全にハンドリングする。
  - `themes/*.css` の `CacheFirst` ルールは維持。ただしバージョン更新を反映するため `expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 3600 }` を付与する。
  - `registerType: 'prompt'` へ切り替え、`navigateFallback: '/index.html'` は維持（オフライン起動時のシェル復元用）。

### Online/Offline 判定の信頼性

- **Context**: `navigator.onLine` は Wi-Fi 接続中でもインターネット到達不能なケース（駅構内 Wi-Fi の captive portal 等）で `true` を返すことがあり、Requirement 7.1 の「heartbeat フォールバック」要求の根拠となる。
- **Sources Consulted**: web.dev "Network reliability" guide, Workbox `BackgroundSyncPlugin` ソース。
- **Findings**:
  - フォアグラウンドで HEAD `/health`（既存の NestJS health controller）に 5 秒間隔 + 失敗時に指数バックオフでフォールバックを行うのが軽量かつ確実。
  - `online` / `offline` イベントを一次シグナル、heartbeat を二次検証として組み合わせれば false positive を抑えられる。
- **Implications**:
  - `useNetworkStatus` を Zustand ストアとして実装。state: `'online' | 'unstable' | 'offline'`。
  - 同期エンジンは `'online'` 遷移を検出してドレインを開始し、`'unstable'` 中は新規送信を抑制する。

### last-write-wins サーバー側契約

- **Context**: クライアント側 `updatedAt` の比較で「自分の編集が古いなら諦める」を実現するため、サーバーに `clientUpdatedAt` を伝える必要がある。
- **Sources Consulted**: RFC 7232 (HTTP Conditional Requests), Prisma `updateMany` + where 条件パターン、PostgreSQL の `WHERE updated_at <= $clientTs` 楽観ロック実装事例。
- **Findings**:
  - 既存の `PATCH /memos/:id` は JSON ボディで DTO を受ける。`If-Unmodified-Since` ヘッダーは秒精度しかなく Date 型として精度不足。`clientUpdatedAt: ISO8601` をボディに追加する方が安全。
  - サーバー側はトランザクション内で `findFirst({ id, userId })` → `existing.updatedAt > clientUpdatedAt` なら `409 Conflict` を返す（body には現在の Memo 表現を含める）。それ以外は `update` を実行。
  - 既存クライアント呼び出し（`useUpdateMemo`）はフィールド未送信でも従来挙動が維持されるよう、`clientUpdatedAt` は **オプショナル**（未送信なら従来通り無条件上書き）。
- **Implications**:
  - DTO に `clientUpdatedAt?: string` を追加、`@IsOptional() @IsISO8601()` でバリデーション。
  - `MemoService.update` は `clientUpdatedAt` 指定時のみ条件比較を行い、敗北時は `ConflictException`（NestJS）を投げる。コントローラ層でレスポンスを組み立てる必要なし。
  - 既存テストへの影響なし、新規テストでの conflict ケース追加が必要。

### オフライン全文検索の性能評価

- **Context**: Requirement 5.2 で「200 件キャッシュ時にミドルレンジ端末で 300 ms 以内」を要求。
- **Sources Consulted**: V8 Engine string-search benchmark, jsperf 過去ログ、Pixel 5 / iPhone XR 実測の参考値。
- **Findings**:
  - 200 件 × 平均 5 KB 本文 = 1 MB 程度の `String.prototype.toLowerCase().includes(q)` 線形スキャンは、ミドルレンジ Android（A55 / SD 750G 級）で 30〜80 ms。
  - HTML タグ（TipTap の出力）を含むため、`stripHtml` した上で検索することで誤検出を減らす。`stripHtml` は事前に IndexedDB の `searchableText` カラムへ生成・キャッシュすると追加コスト 0。
- **Implications**:
  - キャッシュ書き込み時に `searchableText: stripHtml(content)` を派生フィールドとして保存。
  - 検索は `memos` ストアを `userId` インデックスでカーソル走査し、`title.toLowerCase().includes(q)` または `searchableText.toLowerCase().includes(q)` でフィルタ → updatedAt 降順ソート。

### Storage クォータと退避戦略

- **Context**: Requirement 8.1 / 8.2 / 8.5 で 50 MB 上限・80% 警告・100 MB 未満時の縮小を要求。
- **Sources Consulted**: `navigator.storage.estimate()` MDN, Chrome ストレージ管理仕様。
- **Findings**:
  - `navigator.storage.estimate()` は Promise を返し、`{ usage, quota }` を取得可能（Chromium / Firefox / Safari 全対応）。
  - 退避ロジックは `updatedAt` 昇順カーソルで `delete` を進めるのが O(n) で済み、200 件でも 1 ms 未満。
- **Implications**:
  - キャッシュ書き込み時に `recomputeQuota()` を呼び、80% 超過なら退避を実行。100 MB 未満枠なら `MAX_ENTRIES = floor(quota / 250 KB)` に縮小。
  - 警告通知は Sentry breadcrumb + UI トースト（Requirement 8.2）。

### React Query との統合パターン

- **Context**: 既存ステアリング指針「React Query をサーバー状態の唯一の真実の源泉とする」に違反せずオフライン対応を実装する必要がある。
- **Sources Consulted**: TanStack Query v5 docs (`networkMode`, `persister` API), [`@tanstack/query-persist-client`](https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient).
- **Findings**:
  - v5 は `networkMode: 'offlineFirst'` を mutation/query 個別に設定でき、オフライン時に query を `paused` にせずキャッシュから返却できる。
  - `persistQueryClient` は React Query キャッシュ全体を sync ストレージへ persist するが、メモ本文を localStorage に書くと容量・PII 観点で不適。**採用しない**。
  - 代わりに、queryFn 内で「オンライン時はネットワーク → 成功時に IndexedDB へ書き込み」「オフライン時は IndexedDB からのみ取得」のラッパー関数を実装し、React Query 側のキャッシュは通常通り運用する（write-through cache）。
- **Implications**:
  - `useMemos` / `useMemo` の queryFn を「`offlineMemoRepository` を経由」に書き換える。`apiClient` 直呼びを廃止する。
  - mutation 系（`useUpdateMemo` など）は「オンライン時 → API → IndexedDB 反映」「オフライン時 → IndexedDB 即時反映 + キュー追加」を内部分岐する。React Query の `onMutate` 楽観更新は維持。

### Sentry 統合と PII ポリシー

- **Context**: ステアリング `tech.md` の Sentry PII ポリシー（`sendDefaultPii: false` + scrubber + `setUser` は id のみ）を本機能でも遵守。
- **Sources Consulted**: 既存 `frontend/src/utils/sentry/sentry-scrubber.ts`, Sentry breadcrumb API。
- **Findings**:
  - 同期失敗ログにメモ本文/タイトルを含めない契約は既存スクラバを通せば達成可能。ただし breadcrumb の `message` には `memoId` のみ、`data` フィールドはステータスコードや `attempt` 回数のみを記録する。
  - 構造化タグ（`feature_area: 'memo'`, `route`, `user_facing`）は Phase 2 AI triage の固定契約なので必ず付与する。
- **Implications**:
  - 同期処理用の Sentry helper（例: `reportSyncBreadcrumb`, `reportSyncError`）を新設し、メッセージ・データのホワイトリスト化を関数内で強制する。
  - `level: 'error'` イベントは Requirement 10.2 の「リトライ上限到達」のみ。通常失敗は breadcrumb のみとし、サンプリング戦略を侵さない。

## Architecture Pattern Evaluation

| Option                                       | Description                                                                | Strengths                                               | Risks / Limitations                                                           | Notes                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Outbox + Cache-Aside（採用）                 | ローカルストアを read-through、書き込みは outbox（保留キュー）に積み上げる | React Query の SoT を維持、明確な同期境界、リトライ容易 | キュー管理コードを自前実装する必要                                            | 既存 autosave / mutation との接続点が最少。Requirement 4 全件を整合 |
| Workbox Background Sync                      | SW の Background Sync API を使ってオフライン PUT/PATCH をキューイング      | 実装量少、ブラウザネイティブ                            | iOS/Safari 未対応、リクエストヘッダー再送のため Bearer トークン期限切れに弱い | Requirement 6.5 (401 ハンドリング) と相性が悪い                     |
| Full CRDT / Yjs                              | ドキュメント単位で OT/CRDT を行い真の同時編集を実現                        | 競合の自動マージが可能                                  | TipTap 統合 + サーバー実装が大きい、本 spec のスコープ外                      | 別 spec で扱う前提（要件導入文に明記）                              |
| Service Worker Sync Manager + IndexedDB のみ | UI 層は `navigator.serviceWorker` を経由して同期を要求                     | UI 層の責務が薄くなる                                   | デバッグ困難、Worker 内で React Query を扱えない、テストしにくい              | UI 駆動の同期通知（Requirement 7.5）の実装が複雑化                  |

選定理由: **Outbox + Cache-Aside** は既存の React Query / autosave / Zustand スタックに最小侵襲で接続でき、Requirement 4・6・7 を一貫して満たす。CRDT は明示的にスコープ外、Background Sync はブラウザ非互換が致命的。

## Design Decisions

### Decision: `idb` を IndexedDB ラッパーとして採用

- **Context**: メモキャッシュ + 保留キュー + メタストアを永続化する基盤が必要。
- **Alternatives Considered**:
  1. Dexie.js — クエリ DSL 付き、ただしバンドル +24 KB
  2. localforage — KV のみ、二次インデックスが使えない
  3. ネイティブ IndexedDB — 冗長、エラーハンドリング煩雑
- **Selected Approach**: `idb`（v8）+ 自前リポジトリ層
- **Rationale**: 200 件規模の単純 KV + 索引アクセスでは Dexie の DSL が不要。バンドル増を最小化し、テーマエフェクト最適化方針（バンドル軽量主義）と整合。
- **Trade-offs**: `+` バンドル極小・型安全 / `-` クエリ DSL なし（線形スキャン or 自前カーソル）
- **Follow-up**: 検索性能を Pixel 5 相当端末で実測（300 ms 目標、Requirement 5.2）。

### Decision: SW から `/api/*` を完全に除外、永続化はアプリ層に統一

- **Context**: Requirement 9.4 と現行 `runtimeCaching` 設定の矛盾解消。
- **Alternatives Considered**:
  1. `runtimeCaching` を維持しつつ、認証ヘッダーを含むリクエストだけ除外する条件式を追加
  2. SW から `/api/*` を完全削除し、全てアプリ層 IndexedDB で扱う
- **Selected Approach**: 後者（完全削除）
- **Rationale**: SW Cache Storage に認証付きレスポンスが残ること自体がリスク。アプリ層で扱えば userId スコープのパージ・暗号化考慮（将来）も一元化できる。
- **Trade-offs**: `+` セキュリティ境界が明快 / `-` SW のキャッシュ恩恵をネットワーク高速化に使えない（メモ用途では影響軽微）
- **Follow-up**: Requirement 9.2 のログアウト時パージ実装と一緒に総合テスト。

### Decision: SW 更新通知は `registerType: 'prompt'`

- **Context**: Requirement 1.6 で「ユーザー操作（または次回起動時）で安全に有効化」を要求。
- **Alternatives Considered**:
  1. `autoUpdate`（現状）— 自動でリロード、編集中にデータ喪失リスク
  2. `prompt` + UI トースト
- **Selected Approach**: `prompt`、`useRegisterSW` の `onNeedRefresh` でトースト表示し、ユーザー承認時に `updateServiceWorker(true)` を呼ぶ
- **Rationale**: 編集中の予期しないリロードはオフライン編集中なら致命的（保留キューが消えることはないが UX 上のサプライズ）。
- **Trade-offs**: `+` UX 安全 / `-` トースト UI を実装する必要
- **Follow-up**: Requirement 1.6 の「次回起動時に有効化」フォールバックは `useRegisterSW` の `onOfflineReady` + `skipWaiting` 不発動時の自然挙動でカバー。

### Decision: `clientUpdatedAt` はリクエストボディで送信、サーバーは 409 で表現

- **Context**: last-write-wins をサーバー権威で実現。
- **Alternatives Considered**:
  1. `If-Unmodified-Since` HTTP ヘッダー — 秒精度・ボディとの一貫性が薄い
  2. ETag / `If-Match` — Memo にバージョンカラム追加が必要、既存 schema を変更
  3. ボディに `clientUpdatedAt` を追加（採用）
- **Selected Approach**: `UpdateMemoDto.clientUpdatedAt?: string`（ISO8601）。サーバーは未指定なら無条件上書き（後方互換）。
- **Rationale**: 既存 DTO の延長で実装でき、Prisma schema の変更不要。
- **Trade-offs**: `+` 後方互換、最小変更 / `-` HTTP の意味論よりアプリ独自の契約
- **Follow-up**: 同期エンジン側で 409 受信時に `existingMemo` をローカルに反映するロジックの単体テスト。

### Decision: 同期エンジンを単一プロデューサ・キュー処理として実装

- **Context**: Requirement 6.7「同期中に新規編集が発生した場合は次サイクルへ」を堅牢に実装する。
- **Alternatives Considered**:
  1. 並列ワーカーで同時送信
  2. シングルキュー + シリアル処理（採用）
- **Selected Approach**: 単一の `SyncEngine` インスタンスがキュー（`pending_operations`）を `updatedAt` 昇順で `for (entry of queue)` 処理。サイクル中の新規追加は次サイクルでドレイン。
- **Rationale**: 同一メモへの並列更新による race condition を完全に排除。RR (round-robin) を意識せずに `await drainCycle()` を回せる。
- **Trade-offs**: `+` 実装単純・テスト容易 / `-` 大量保留時のスループット低下（ただし想定 30 分〜1 時間オフライン時の編集量では問題なし）

## Risks & Mitigations

- **Risk: SW 既存 `/api/*` キャッシュからの認証情報漏洩** — リリース時に Workbox の precache および runtime cache のうち `/api/` を含むものを `caches.delete()` で明示削除するマイグレーションを `useRegisterSW` の初回登録時に実行。
- **Risk: IndexedDB のスキーマ変更で既存ユーザーのキャッシュが破損** — DB バージョンを `1` から開始し、`upgrade()` ハンドラで欠損ストア作成 + 失敗時は Requirement 2.6 の通り `deleteDB → 再作成` でフォールバック。
- **Risk: `clientUpdatedAt` 未送信のレガシー API 呼び出しでサイレント上書き発生** — オフライン同期由来の `PATCH` には必ず `clientUpdatedAt` を付与するレイヤーを `OfflineMemoRepository` 内で強制（呼び出し側は意識しない）。
- **Risk: heartbeat のリクエスト多発による 4G データ消費 / バッテリー消費** — `'unstable'` 状態でのみ実行、`'online'` 確定後は停止。`visibilityState: 'hidden'` 中も停止。
- **Risk: TipTap HTML の `stripHtml` で全角/IME 文字列が壊れる** — `DOMParser` ベースの最小実装（textContent 取得のみ）に限定し、スタイルや属性の解釈はしない。

## References

- [vite-plugin-pwa Documentation](https://vite-pwa-org.netlify.app/) — `registerType` と `useRegisterSW` の利用例
- [idb (jakearchibald/idb)](https://github.com/jakearchibald/idb) — Promise ラッパーの API リファレンス
- [TanStack Query networkMode](https://tanstack.com/query/v5/docs/framework/react/guides/network-mode) — `offlineFirst` の挙動
- [MDN — `navigator.storage.estimate()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) — クォータ取得 API
- [Web.dev — Workbox strategies](https://web.dev/articles/workbox/) — ストラテジー比較とアンチパターン
- [docs/deployment/sentry.md](../../../docs/deployment/sentry.md) — 既存 Sentry サンプリング戦略・PII ポリシー

# Requirements Document

## Project Description (Input)

PWAのService Worker更新方式を現行の registerType: 'prompt' から 'autoUpdate' に変更し、SWキャッシュに古いフロントバンドルが残り続ける問題を構造的に解消する。

背景: onboarding機能は本番含めソースから完全削除済み(api.mosaku.jpで /onboarding/\* が404、削除デプロイ済みを2026-06-20に検証。証跡は `.kiro/specs/onboarding-removal/verification.md`)。だが prompt 方式ではユーザーが更新トースト(SwUpdatePrompt)を押さない限り削除前バンドルが waiting のまま居座り、削除済みUI(onboarding等)が表示され続ける。

対象:

- `frontend/src/utils/pwa/pwa-config.ts` の registerType
- `frontend/src/hooks/useSwRegistration.ts`
- `frontend/src/components/pwa/SwUpdatePrompt.tsx` の更新導線

要件の考慮点:

1. 新版検知時に自動で skipWaiting ＆リロードし、ユーザー操作ゼロで最新化する。
2. メモ/ノート編集中の自動保存(`useAutoSave`)が確実に効いた状態でリロードされ、未保存データを失わないこと。必要なら未保存変更があるときはリロードを遅延／確定後に実行するガードを設ける。
3. SWの一世代遅れ特性(既存の古いSWを掴むクライアントは次回取得→そのまた次から自動化)をどう扱うか。kill-switch的な一回限りの強制更新を併用するか許容するかを決める。
4. テーマCSSのCacheFirstランタイムキャッシュ(`mosaku-theme-css`)への副作用が無いこと。
5. prefers-reduced-motion／編集フォーカス等の既存エフェクト自動停止条件と、自動リロードのタイミングが衝突しないこと。

非対象:

- backend/DBの変更(onboarding削除は完了済み)
- キャッシュ戦略の全面再設計

## Introduction

本機能は PWA の Service Worker 更新方式を現行の `registerType: 'prompt'` から `'autoUpdate'` へ変更し、削除済みフロントエンドバンドルが SW キャッシュに滞留する問題を構造的に解消する（詳細な背景は上記 Project Description を参照）。ユーザー操作ゼロでの最新化を実現しつつ、編集中の未保存データ（`useAutoSave`）の保護と、既存キャッシュ戦略・テーマエフェクト挙動への副作用ゼロを保証する。

**本要件で確定した方針:**

- **既存 prompt 版 SW クライアントの移行**: 「許容＋定期更新チェック」とする。SW の一世代遅れ特性上、初回移行の完全無操作化は仕様的に不可能なため、現実解として最初の1サイクルのみ移行コスト（更新操作または全タブクローズ後の再訪）を許容し、以降は完全自動化する。kill-switch 等の強制機構は導入しない。
- **更新通知 UI（`SwUpdatePrompt`）**: 撤去し、完全にシームレスな自動更新とする。

**対象は frontend のみ**（PWA 設定・SW 登録フック・更新通知 UI）。backend/DB の変更とキャッシュ戦略の全面再設計は対象外。

## Requirements

### Requirement 1: Service Worker の自動更新（無操作での最新化）

**Objective:** PWA 利用者として、更新操作をしなくても常に最新のフロントエンドが表示されてほしい。削除済みの古い UI に惑わされず、最新の機能・修正をすぐ使えるようにするため。

#### Acceptance Criteria

1. The PWA更新機構 shall Service Worker を `registerType: 'autoUpdate'`（`skipWaiting` + `clientsClaim` 相当）で登録する。
2. When 新しいバージョンの Service Worker がインストール可能になったとき, the PWA更新機構 shall ユーザーの確認操作を求めずに新 Service Worker を有効化する。
3. When 新 Service Worker がページの制御を獲得したとき, the PWA更新機構 shall アプリケーションを自動的に再読み込みし最新バンドルを適用する。
4. The PWA更新機構 shall 更新の適用にあたり、確認ダイアログ・更新ボタン等のユーザー操作を一切要求しない。
5. If 利用可能な新バージョンが存在しないとき, the PWA更新機構 shall 再読み込みを行わない。
6. The PWA更新機構 shall 単一の更新サイクルにつき再読み込みを高々 1 回に抑え、リロードループを発生させない。

### Requirement 2: 未保存データの保護と編集中リロードの抑止

**Objective:** メモ・ノート編集者として、自動更新による再読み込みで書きかけの内容を絶対に失いたくない。安心して書き続けられるようにするため。

#### Acceptance Criteria

1. While 自動保存が未確定の状態（`saveStatus` が `pending` または `saving`）であるとき, the PWA更新機構 shall 自動再読み込みを保留する。
2. While エディタがフォーカスされ編集中であるとき, the PWA更新機構 shall 自動再読み込みを保留する。
3. If 自動保存がエラー状態（`saveStatus` が `error`）であるとき, the PWA更新機構 shall 自動再読み込みを保留し、未保存内容を保持する。
4. When 保留条件が解消し自動保存が確定状態（`saved` / `offline-saved` / `idle`）になったとき, the PWA更新機構 shall 保留していた再読み込みを実行する。
5. The PWA更新機構 shall 再読み込みの実行前に、進行中の自動保存処理の完了を待機する。
6. The 自動保存機構 shall 本機能の導入後も、編集停止後の自動保存を従来どおりの挙動で継続する。

### Requirement 3: 旧 Service Worker クライアントの移行と最新性の維持

**Objective:** 運用者として、現在 prompt 版 SW を掴んでいる既存ユーザーも確実に新方式へ移行し、長時間タブを開いたままのユーザーにも更新が届いてほしい。一世代遅れで削除済み UI が残り続けないようにするため。

#### Acceptance Criteria

1. The PWA更新機構 shall 既存 prompt 版 SW クライアントを、最大 1 回の更新サイクル（ユーザーによる更新操作または全タブクローズ後の再訪）を経て autoUpdate 方式へ移行させる。
2. While アプリが起動して稼働している間, the PWA更新機構 shall 一定間隔で新バージョンの有無を確認する（定期更新チェック）。
3. When ユーザーがアプリを再フォーカスまたは再訪問したとき, the PWA更新機構 shall 新バージョンの有無を確認する。
4. The PWA更新機構 shall SW の一世代遅れ特性に起因する初回移行の制約を、専用 kill-switch を導入せず許容する。
5. When 定期チェックで新バージョンを検知したとき, the PWA更新機構 shall Requirement 2 のガード条件を尊重した上で自動更新フローを開始する。

### Requirement 4: 既存キャッシュ・ランタイム挙動の保全（副作用ゼロ）

**Objective:** 利用者・運用者として、自動更新化によってテーマ表示・オフライン挙動・テーマエフェクトなど既存の体験が壊れないでほしい。

#### Acceptance Criteria

1. The PWA更新機構 shall テーマ CSS のランタイムキャッシュ（`mosaku-theme-css`、CacheFirst）を従来どおり維持し、自動更新の前後でテーマ表示に影響を与えない。
2. The PWA更新機構 shall 既存のプリキャッシュ設定（`globPatterns` および `globIgnores` の `**/themes/**/*.css` 除外）を維持する。
3. When Service Worker が登録されたとき, the PWA更新機構 shall 旧 `api-cache`（legacy）の purge（`purgeLegacyApiCache`）を従来どおり実行する。
4. The PWA更新機構 shall テーマエフェクトの自動停止条件（`prefers-reduced-motion` / エディタフォーカス / タブ非表示 / マウスアイドル）の判定ロジックに干渉しない。
5. The PWA更新機構 shall `navigateFallback`（`/index.html`）および API パス（`/api/`）の除外設定を維持する。

### Requirement 5: 更新通知 UI の撤去（シームレス化）

**Objective:** PWA 利用者として、自動更新が前提なら不要な更新トーストに煩わされたくない。シームレスに最新版が使えるようにするため。

#### Acceptance Criteria

1. The フロントエンド shall 更新トースト UI（`SwUpdatePrompt`）を表示しない。
2. The フロントエンド shall 手動更新導線（`needRefresh` 監視および `update()` ボタン）を撤去する。
3. While 自動更新が正常に機能している間, the フロントエンド shall 更新に関するユーザー向け通知を表示しない。
4. The フロントエンド shall `SwUpdatePrompt` 撤去に伴い、関連するマウント箇所（`App.tsx`）および不要になったコード・テストを除去する。

### Requirement 6: 削除済みバンドルの再出現防止と検証

**Objective:** 開発者・運用者として、自動更新化が「削除済み UI が残る問題」を実際に解消したことを検証可能にしたい。リグレッションを防ぐため。

#### Acceptance Criteria

1. When 新バンドルがデプロイされ自動更新が完了したとき, the PWA更新機構 shall 削除済み UI（onboarding 等）を含む旧バンドルを表示しない。
2. The フロントエンド shall 自動更新の中核挙動（`autoUpdate` 登録・未保存ガード・通知撤去）を検証する自動テストを備える。
3. The 検証プロセス shall 本番環境で自動更新により最新バンドルが適用されることを確認し、結果を記録する。

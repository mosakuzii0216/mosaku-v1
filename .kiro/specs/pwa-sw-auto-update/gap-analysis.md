# 実装ギャップ分析 - pwa-sw-auto-update

> 対象要件: `requirements.md`（generated / **未承認**）
> 種別: 既存 PWA 更新方式の挙動変更（frontend 限定）。SW 設定・登録フック・更新通知 UI の改修＋未保存ガード新設。

## 分析サマリ

- **最大の構造ギャップ（Req 2）**: 未保存ガードに必要な `saveStatus` は `useAutoSave` の **コンポーネントローカル `useState`**（`MemoEditor.tsx` L149 / `NotebookEditor.tsx` L109 の 2 箇所）。一方、SW 登録は App ルート（`App.tsx` の `SwUpdatePrompt`）に居る。リロード可否を App 層で判定するには **`saveStatus` のグローバル化（集約）が必須**。エディタフォーカス（Req 2.2）は既に `useEditorFocusStore`（Zustand グローバル）で解決済みなので、この前例に倣える。
- **最大の設計テンション（Req 1 × Req 2）**: 素の `registerType: 'autoUpdate'` は vite-plugin-pwa が `controllerchange` で **無条件即リロード**する挙動で、編集中はリロードを遅延させたい Req 2 と衝突する。AC 1.1 の「`skipWaiting` + `clientsClaim` **相当**」という文言が、_リテラルな registerType 値_ ではなく _autoUpdate セマンティクス（無操作更新）を制御付きで実現_ する設計余地を与える。
- **コード分割の副作用リスク**: テーマエフェクトは `themeEffectRegistry` の `React.lazy` 動的 import（tech.md）。`clientsClaim` で新 SW が即時制御を奪うと、リロード前に lazy チャンクを取得した瞬間に旧チャンクが 404 化する恐れ。→ 「旧 SW が旧チャンクを配り続ける」prompt ビルド維持型のほうが遅延リロードに安全。
- **新規capability（Req 3.2/3.3）**: 定期更新チェック・フォーカス/再訪チェックは **現状ゼロ**。`onRegisteredSW` は `purgeLegacyApiCache` のみ。`setInterval(registration.update())` ＋ visibility/focus リスナーの新設が要る。
- **撤去スコープ（Req 5）＋テスト改修**: `SwUpdatePrompt.tsx`(+test)、`App.tsx` のマウント、`useSwRegistration` の `needRefresh/offlineReady/update/dismiss` 面、`pwa-config.test.ts` の `registerType==='prompt'` アサート（L7-9）が改修対象。要件未明記のテスト改修あり。
- 工数 **M（3〜7日）** / リスク **Medium**。単なる設定フリップではなく、2 エディタ横断の状態集約・ガード付きリロード・定期チェック・撤去とテスト再設計を伴う。

## 現状調査（Current State）

### PWA スタック

| アセット                                             | 役割                                                                                                                | 備考                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `frontend/src/utils/pwa/pwa-config.ts`               | `buildPwaOptions()`。`registerType: 'prompt'`、workbox 設定（globIgnores/runtimeCaching/navigateFallback/denylist） | `vite.config.ts` L11 で `VitePWA(buildPwaOptions())`                       |
| `frontend/src/hooks/useSwRegistration.ts`            | `useRegisterSW` ラッパ。`needRefresh/offlineReady/update/dismiss` 公開。`onRegisteredSW` で `purgeLegacyApiCache`   | 更新トーストの唯一の駆動元                                                 |
| `frontend/src/components/pwa/SwUpdatePrompt.tsx`     | 更新トースト UI（更新する／あとで）                                                                                 | `App.tsx` L16/L66 でマウント                                               |
| `frontend/src/utils/pwa/cache-cleanup.ts`            | `purgeLegacyApiCache('api-cache')`                                                                                  | registerType と独立                                                        |
| `frontend/src/test/mocks/virtualPwaRegisterReact.ts` | vitest 用 `virtual:pwa-register/react` スタブ                                                                       | `onNeedRefresh/onOfflineReady/onRegisteredSW/onRegisterError` をサポート済 |

### 自動保存・フォーカス（ガード対象）

| アセット                                                   | 役割                                                                                                    | グローバル性                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `frontend/src/hooks/useAutoSave.ts`                        | `saveStatus`（`idle/pending/saving/saved/error/offline-saved`）を **ローカル `useState`** で保持（L49） | ❌ ローカル                     |
| `frontend/src/components/memo/MemoEditor.tsx` L149         | `useAutoSave` 利用元①                                                                                   | ❌ ローカル                     |
| `frontend/src/components/notebook/NotebookEditor.tsx` L109 | `useAutoSave` 利用元②                                                                                   | ❌ ローカル                     |
| `frontend/src/stores/useEditorFocusStore.ts`               | `isEditorFocused`（Zustand）                                                                            | ✅ **グローバル（前例）**       |
| `frontend/src/components/editor/RichTextEditor.tsx` L65-80 | フォーカス状態を store に publish                                                                       | —                               |
| `frontend/src/hooks/useMoriEffectControl.ts`               | reduced-motion / focus / visibility / mouse-idle を集約（Req 4.4 の停止条件本体）                       | `visibilitychange` リスナー既存 |

**重要事実**: `saveStatus` の SoT はエディタ内ローカル、`isEditorFocused` はグローバル。Req 2 のガードは「ローカル状態を App 層に持ち上げる」ことが本質的な作業。これは React Query の不変則（サーバー状態を Zustand に複製しない）には**抵触しない**——`saveStatus` はサーバーデータではなく一時的 UI 状態で、`useEditorFocusStore` と同カテゴリ。

## Requirement-to-Asset マップ

| 要件                                | 対象アセット                                                                                  | 状態          | 備考                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| R1.1 autoUpdate 登録                | `pwa-config.ts` L8 `registerType`、`pwa-config.test.ts` L7-9                                  | ⚠️Constraint  | 「相当」文言が機構の選択余地を与える。テストの `'prompt'` アサートも改修必須（**要件未明記**） |
| R1.2-1.4 無操作有効化               | `useSwRegistration.ts`（更新トリガを自動化）                                                  | 🟡Missing     | 現状は手動 `update()`。自動駆動ロジックが新規                                                  |
| R1.6 リロード高々1回                | 新規ガード/スケジューラ                                                                       | 🟡Missing     | `controllerchange`→reload の二重発火・ループ防止フラグが要                                     |
| R2.1-2.3 未保存ガード               | `useAutoSave.ts` の `saveStatus` を**グローバル集約**                                         | 🔴**Missing** | **本機能の構造的中核**。2 エディタ横断の集約方式が design 決定事項                             |
| R2.2 編集中ガード                   | `useEditorFocusStore.ts`                                                                      | ✅特定済      | 既存グローバル store を読むだけ                                                                |
| R2.4 解消後リロード実行             | 新規ガードスケジューラ（`saveStatus` settled を監視）                                         | 🟡Missing     | 「pending reload」を保持し settled で flush するリアクティブ effect                            |
| R2.5 進行中保存の完了待機           | `saveStatus` が `saving` を抜けるのを監視                                                     | ✅Constraint  | `useAutoSave` に Promise 公開を足さずとも状態監視で代替可                                      |
| R2.6 自動保存の挙動不変             | `useAutoSave.ts`                                                                              | ✅Constraint  | publish 追加時も既存デバウンス/状態遷移を壊さないこと                                          |
| R3.1/3.4 旧 prompt クライアント移行 | 性質上 1 世代遅れ（許容済）                                                                   | ✅Constraint  | クライアント JS が更新される 1 サイクルで自然移行。kill-switch 非導入                          |
| R3.2 定期更新チェック               | `onRegisteredSW(swUrl, registration)` ＋ `setInterval(registration.update())`                 | 🟡Missing     | **新規**。現状 interval なし                                                                   |
| R3.3 フォーカス/再訪チェック        | `visibilitychange`/`focus` リスナー                                                           | 🟡Missing     | **新規**。`useMoriEffectControl` の visibility パターン流用可                                  |
| R3.5 検知時ガード尊重               | R2 ガードと統合                                                                               | 🟡Missing     | 定期チェック検知 → ガード経由で自動更新                                                        |
| R4.1-4.2 テーマ CSS キャッシュ維持  | `pwa-config.ts` L11-25, globIgnores                                                           | ✅Constraint  | registerType と直交。触らず維持                                                                |
| R4.3 legacy api-cache purge 維持    | `cache-cleanup.ts`, `useSwRegistration.ts` L19-21                                             | ✅Constraint  | `onRegisteredSW` 改修時も purge 呼び出しを残す                                                 |
| R4.4 エフェクト自動停止に非干渉     | `useMoriEffectControl.ts`                                                                     | ✅Constraint  | 別関心事。visibility リスナー併存は問題なし                                                    |
| R4.5 navigateFallback/denylist 維持 | `pwa-config.ts` L15-16                                                                        | ✅Constraint  | 維持                                                                                           |
| R5.1-5.3 トースト/手動導線撤去      | `SwUpdatePrompt.tsx`(+test), `useSwRegistration` の `needRefresh/update/dismiss/offlineReady` | 🔴Missing     | `offlineReady` は他に未使用（grep 確認済）→ dead 化。撤去範囲の確定が要                        |
| R5.4 マウント箇所・テスト除去       | `App.tsx` L16/L66, `SwUpdatePrompt.test.tsx`                                                  | ✅特定済      | unmount＋テストファイル削除                                                                    |
| R6.1 旧バンドル非表示               | 検証（onboarding 等）                                                                         | ✅Constraint  | 本番検証で確認                                                                                 |
| R6.2 中核挙動の自動テスト           | `useSwRegistration.test.ts` / `pwa-config.test.ts` 再設計＋新ガードの test                    | 🟡Missing     | **要件未明記の既存テスト改修**を含む                                                           |
| R6.3 本番検証の記録                 | `onboarding-removal/verification.md` の前例流用                                               | ✅特定済      | プロセスのみ。低工数                                                                           |

凡例: ✅特定済/Constraint（既存維持・触らない） / ⚠️要件文言の解釈余地 / 🟡新規 capability / 🔴構造的中核ギャップ・撤去スコープ未確定

## 実装アプローチ

### autoUpdate 実現機構の二択（design の最重要決定）

ガード付き自動更新を「どの SW ビルドモードで」実現するかで 2 系統ある。

- **機構 M1: prompt ビルド維持＋自動駆動（安全寄り・推奨候補）**
  `registerType: 'prompt'` のまま（新 SW は `SKIP_WAITING` まで待機）。トーストの代わりに、ガード条件通過時に `updateServiceWorker(true)` を**自動で**呼ぶ。旧 SW が制御を握り続けるため、遅延リロード中も旧 lazy チャンクが配られ続け **チャンク 404 リスクが無い**。AC 1.1 は「相当」なので autoUpdate セマンティクス（無操作）を満たせる。
  - ✅ 遅延リロードに安全（コード分割と相性良）/ 制御点が明瞭 / Req 3 移行が自然（SW skipWaiting セマンティクス不変、変わるのはクライアント JS のみ）
  - ❌ リテラルの `registerType: 'autoUpdate'` ではない（AC 1.1 の字面と差。要 design で「相当」解釈を明文化）

- **機構 M2: 真の autoUpdate＋自動リロード抑止＋自前ガードリロード**
  `registerType: 'autoUpdate'`（SW が即 `skipWaiting`/`clientsClaim`）にしつつ、プラグインの `controllerchange` 自動リロードを抑止し、自前のガード付きリロードを実装。
  - ✅ AC 1.1 の字面に忠実
  - ❌ `clientsClaim` 即時奪取で、リロード前の lazy チャンク取得が 404 化し得る（**本アプリは該当**）/ 自動リロード抑止が可能かは要検証（Research Needed）/ リロードループ防止が難化

### Option A: 既存 PWA フックを拡張（推奨ベース）

`useSwRegistration` を「ガード付き自動更新オーケストレータ」へ拡張し、`saveStatus` グローバル store を新設、トーストを撤去。

- ✅ 新規ファイル最小・既存パターン（`useEditorFocusStore`）に倣える / 配線が 1 フックに集約
- ❌ フックの責務が肥大（登録＋purge＋定期チェック＋ガード＋リロード）。単一責任が崩れやすい

### Option B: 専用オーケストレータを新設

`useSwAutoUpdate`（or `SwAutoUpdater` マウント）を新設し、`useSwRegistration` は薄い登録専任に保つ。ガード（save/focus 集約）は新責務なので分離の妥当性が高い。

- ✅ 関心の分離・単体テスト容易（Req 6.2 に有利）/ `useSwRegistration` を汚さない
- ❌ ファイル増・インターフェース設計が必要

### Option C: ハイブリッド（推奨）

設定フリップ＋`saveStatus` 集約 store は **拡張**で、ガード付きリロードのスケジューラだけ **新規の小フック**として切り出す。

- ✅ 既存資産の再利用とテスト容易性の両立 / ガードという新責務を独立させ Req 6.2 のテスト境界が綺麗
- ❌ 計画がやや増える（store・スケジューラ・撤去の協調）

## 工数・リスク

- **工数: M（3〜7日）** — 設定 1 行ではない。①`saveStatus` の 2 エディタ横断グローバル化、②ガード付きリロードスケジューラ、③定期/フォーカス更新チェック新設、④トースト撤去＋3 テストファイル再設計、⑤本番検証。すべて既知パターン内だが統合点が多い。
- **リスク: Medium**
  1. **チャンク 404（M2 採用時）**: `clientsClaim` 即時奪取×`React.lazy` 動的 import で、遅延リロード窓の間に旧チャンクが消える。→ M1 採用で回避可。
  2. **リロードループ（Req 1.6）**: skipWaiting と reload の二重発火。ワンショットフラグ必須。
  3. **`error` 状態の飢餓（Req 2.3）**: 保存が失敗し続けると `error` でリロードが恒久保留 → 旧バンドル（削除済み UI）が残り Req 1/6 と緊張。要件は「データ保護優先」を明言済だが、design で許容を再確認すべき。
  4. **1 世代遅れの不可避性**: M1/M2 いずれもクライアント JS が更新される 1 サイクルは無操作化不可（要件が許容済）。
  5. **vite-plugin-pwa の autoUpdate 内部挙動**: 自動リロードの抑止可否・`onRegisteredSW` の `registration` 安定性が未確証（Research Needed）。

## design フェーズへの引き継ぎ

**推奨アプローチ**: Option C（ハイブリッド）＋ 機構 **M1（prompt ビルド維持＋自動駆動）** を第一候補。理由はコード分割（`React.lazy`）下での遅延リロード安全性。M2 を採る場合は AC 1.1 の字面に忠実な代償としてチャンク 404 緩和策（例: リロードまで新 SW の precache 削除を遅らせる／フォールバック再取得）を設計に含めること。

**設計で確定すべき決定事項**:

1. **autoUpdate 実現機構（M1 vs M2）** と、AC 1.1「相当」の解釈の明文化。M1 採用なら `pwa-config.test.ts` のアサートを「自動駆動契約」へ書き換える方針も併記。
2. **`saveStatus` 集約方式** — 2 エディタを横断する単一の真実をどう作るか。候補: (a) `useAutoSave` が global store に publish、(b) 各エディタが `saveStatus` を mirror（`RichTextEditor`→`useEditorFocusStore` の前例）、(c) 「進行中保存カウンタ」store（increment/decrement で複数エディタを自然集約）。Req 2.6（自動保存の挙動不変）を壊さない配線を選ぶ。
3. **ガード条件式の確定** — リロード可 = `saveStatus ∉ {pending, saving, error}` **かつ** `!isEditorFocused`。pending reload を保持し、settled 化で flush するリアクティブ effect の置き場所。
4. **定期/フォーカス更新チェック** — `setInterval(registration.update())` の間隔（Req 3.2）と `visibilitychange`/`focus` トリガ（Req 3.3）。`useMoriEffectControl` の visibility パターン流用。
5. **撤去スコープの正式化** — `SwUpdatePrompt.tsx`(+test) 削除、`App.tsx` unmount、`useSwRegistration` の `needRefresh/offlineReady/update/dismiss` のうち dead 化する面の除去。**要件未明記の `pwa-config.test.ts`/`useSwRegistration.test.ts` 改修を tasks に明示**。
6. **本番検証手順** — `onboarding-removal/verification.md` 形式で、自動更新後に削除済み UI（onboarding 等）が出ないことを記録（Req 6.3）。

**Research Needed**:

- vite-plugin-pwa（`vite-plugin-pwa` / workbox）の `autoUpdate` モードで、`useRegisterSW` 使用時に `controllerchange` 自動リロードを**抑止して**ガードを差し込めるか（M1/M2 の最終判断材料）。
- `onRegisteredSW(swUrl, registration)` が返す `registration` で `.update()` ポーリングが安定動作するか、推奨間隔の相場。
- `clientsClaim` 直後〜リロード前の窓で、本アプリの `React.lazy` チャンク取得が実際に 404 化するか（M2 のリスク実証）。

## 次のステップ

- 撤去スコープ補正（`pwa-config.test.ts`/`useSwRegistration.test.ts` をテスト改修対象として明記）を反映するなら、先に `requirements.md` を更新して再承認。
- そのまま進める場合: `/kiro:spec-design pwa-sw-auto-update`（design 内で機構 M1/M2 とスコープ補正を吸収）。

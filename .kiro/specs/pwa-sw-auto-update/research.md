# Research & Design Decisions — pwa-sw-auto-update

---

**Purpose**: Service Worker 自動更新化（prompt → autoUpdate セマンティクス）の設計判断を支える discovery 結果と意思決定の記録。

---

## Summary

- **Feature**: `pwa-sw-auto-update`
- **Discovery Scope**: Extension（既存 PWA 更新方式の挙動変更・frontend 限定）
- **Key Findings**:
  - vite-plugin-pwa **1.3.0** / workbox-window **7.4.1**。prompt モードのまま `updateServiceWorker(true)` を**プログラムから呼べば** skipWaiting＋リロードが発火する。これにより「`registerType: 'prompt'` を維持したまま無操作更新（autoUpdate セマンティクス）」が成立する（**機構 M1**）。
  - 公式 autoUpdate ガイドが「未保存フォームがあるとデータを失う」と明記。Req 2（未保存ガード）の必要性を公式が裏付ける。素の `autoUpdate` は `controllerchange` で**無条件リロード**するため、編集中遅延が必要な本要件と直接衝突する。
  - 公式の定期更新パターンは `onRegisteredSW(swUrl, r)` 内で `setInterval(() => r.update())`、推奨間隔 **1 時間**、`r.installing`・オフライン時はスキップ、`fetch(swUrl, {cache:'no-store'})` が 200 のときのみ `update()`。Req 3.2/3.3 をこのパターンで実装可能。
  - `saveStatus` は `useAutoSave` の**ローカル `useState`**（2 エディタ）。App 層でリロード可否を判定するには**グローバル集約が必須**。`useEditorFocusStore`（Zustand）が同カテゴリの前例。
  - コード分割（`themeEffectRegistry` の `React.lazy`）下では、`clientsClaim` 即時奪取（機構 M2）が遅延リロード窓で旧チャンク 404 を招くリスク。prompt 維持（M1）は旧 SW が旧チャンクを配り続けるため安全。

## Research Log

### vite-plugin-pwa の autoUpdate / prompt と `updateServiceWorker` の挙動

- **Context**: AC 1.1「`registerType: 'autoUpdate'`（skipWaiting + clientsClaim **相当**）」の「相当」をどう実装するか。素の autoUpdate がガード（Req 2）と両立するかの判断。
- **Sources Consulted**:
  - [Auto Update — vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/auto-update.html)
  - [Prompt for Update — vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)
- **Findings**:
  - autoUpdate モードは新版検知時にブラウザのタブ/ウィンドウを自動リロードする。公式は「**autoUpdate は未保存フォームがあるとユーザーがデータを失い得る**」と明示的に警告。
  - prompt モードはデフォルトでは何も起こさず、`updateServiceWorker(reloadPage?)` を呼ぶまで新 SW は `waiting` のまま。
  - `updateServiceWorker(true)` は waiting worker に SKIP_WAITING を送り、`controllerchange` でページをリロードする。**呼び出しタイミングは呼び出し側が完全に制御できる。**
- **Implications**: prompt ビルドを維持しつつ、トースト UI の代わりに**ガード通過時に自動で** `updateServiceWorker(true)` を呼ぶ＝無操作更新を「制御付き」で実現できる（機構 M1）。これが AC 1.1「相当」の実装解。`registerType` は `'prompt'` のまま据え置けるため、Req 4（キャッシュ不変則）は workbox 設定を一切触らずに満たせる。

### 定期更新チェックの公式パターン（Req 3.2 / 3.3）

- **Context**: 長時間タブを開いたままのクライアントへ更新を届ける手段が現状ゼロ（`onRegisteredSW` は purge のみ）。
- **Sources Consulted**: [Periodic Service Worker Updates — vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates.html)
- **Findings**:
  - 署名は `onRegisteredSW(swUrl, r)`（`r` は `ServiceWorkerRegistration | undefined`）。
  - 推奨実装: `setInterval` 内で「`r.installing` なら return」「`navigator.onLine` が false なら return」「`fetch(swUrl, {cache:'no-store'})` が 200 のときだけ `r.update()`」。
  - 推奨間隔は `60 * 60 * 1000`（1 時間）。
- **Implications**: Req 3.2 は `onRegisteredSW` で取得した `registration` を ref 保持し、60 分間隔のポーリングで実装。Req 3.3 は同じ probe 関数を `visibilitychange`（visible 化）/ `focus` で呼ぶ。`useMoriEffectControl` の `visibilitychange` リスナーと**独立に併存**可能（共有状態なし → Req 4.4 非干渉）。

### `saveStatus` の集約と React Query 不変則の整合

- **Context**: Req 2 のガードは `saveStatus`（ローカル）と `isEditorFocused`（グローバル）の合成。App 層判定にはローカル状態の持ち上げが必要。
- **Sources Consulted**: `useAutoSave.ts` / `MemoEditor.tsx`(L149) / `NotebookEditor.tsx`(L109) / `useEditorFocusStore.ts` / `RichTextEditor.tsx`（focus publish 前例）／CLAUDE.md 不変則。
- **Findings**:
  - `saveStatus` は**サーバーデータではない一時 UI 状態**。Zustand 集約は「React Query をサーバー状態の真実の源泉とし Zustand に複製しない」不変則に**抵触しない**（`useEditorFocusStore` と同カテゴリ）。
  - 本アプリは**単一エディタ稼働**（memo か notebook のどちらか）。ただしビュー遷移時の一時的な mount 重複に備え、単一スロットより**インスタンス id 付きレジストリ**のほうが last-writer-wins クロバを避けられ堅牢。
- **Implications**: 新規 `useSaveStatusStore`（`Record<instanceId, SaveStatus>` レジストリ＋派生セレクタ `selectHasUnsavedWork`）を導入。`useAutoSave` は `useId()` 単位で publish/clear するのみ（状態機械は不変 → Req 2.6 維持）。

### コード分割下のチャンク 404 リスク（M1 採用の決め手）

- **Context**: テーマエフェクトは `React.lazy` 動的 import（tech.md）。新 SW 即時制御が遅延リロード窓で旧チャンクを 404 化しないか。
- **Sources Consulted**: `themeEffectRegistry.ts`（gap-analysis 記載）/ structure.md / tech.md。
- **Findings**: M2（真の autoUpdate＋`clientsClaim`）は新 SW が即座に制御を奪い、旧 precache を破棄するため、リロード前に未取得の lazy チャンクへアクセスすると 404 化し得る。M1（prompt 維持）は**旧 SW が waiting 中も制御を握り続け**、旧チャンクを配り続けるため遅延リロード窓でも安全。
- **Implications**: 遅延リロード（Req 2）とコード分割（既存）の両立には M1 が構造的に優位。M1 を第一候補に確定。

## Architecture Pattern Evaluation

### autoUpdate 実現機構

| Option                                            | Description                                                                           | Strengths                                                                                         | Risks / Limitations                                                                     | Notes                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| **M1: prompt 維持＋自動駆動（採用）**             | `registerType:'prompt'` のまま、ガード通過時に `updateServiceWorker(true)` を自動呼出 | 遅延リロード×コード分割に安全 / 制御点が明瞭 / Req 4 を無改修で満たす / 移行は client JS 更新のみ | AC 1.1 の字面（`'autoUpdate'`）と差 →「相当」解釈の明文化が要                           | gap-analysis 推奨と一致    |
| M2: 真の autoUpdate＋自動リロード抑止＋自前ガード | `registerType:'autoUpdate'` にしプラグインの自動リロードを抑止                        | AC 1.1 の字面に忠実                                                                               | `clientsClaim` 即時奪取で lazy チャンク 404 リスク / 自動リロード抑止の確実性に不確実性 | 本アプリのコード分割で不利 |

### オーケストレーション構成

| Option                          | Description                                                                           | Strengths                                              | Risks / Limitations                                        | Notes                   |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------- |
| A: 既存フック拡張のみ           | `useSwRegistration` に全責務を集約                                                    | 新規ファイル最小                                       | 単一フックの責務肥大（登録＋purge＋probe＋ガード＋reload） | SRP 崩れ                |
| B: 専用オーケストレータ新設のみ | すべて新規フック                                                                      | 関心分離                                               | registration 由来の probe を別フックに渡す配線が冗長       | —                       |
| **C: ハイブリッド（採用）**     | 登録/probe/purge は `useSwRegistration`、ガード+reload は新規フック、状態は新規 store | 関心分離＋既存資産再利用 / テスト境界が綺麗（Req 6.2） | 協調する部品が増える                                       | gap-analysis 推奨と一致 |

## Design Decisions

### Decision: 機構 M1（prompt ビルド維持＋自動駆動）を採用し AC 1.1「相当」を明文化

- **Context**: AC 1.1 が `registerType:'autoUpdate'` を要求する一方、Req 2 は編集中リロードの遅延を要求し、素の autoUpdate（無条件リロード）と衝突する。
- **Alternatives Considered**: 1) M1（prompt 維持＋自動駆動） 2) M2（真 autoUpdate＋抑止＋自前ガード）
- **Selected Approach**: `registerType` は `'prompt'` のまま据え置く。トースト UI を撤去し、ガード（保存確定 ∧ 非フォーカス）が通った瞬間に `updateServiceWorker(true)` を自動呼出して skipWaiting＋リロードを発火する。
- **Rationale**: ① コード分割（`React.lazy`）下で遅延リロード窓のチャンク 404 を構造的に回避。② workbox 設定を一切触らないため Req 4 のキャッシュ不変則を無改修で満たす。③ 移行はクライアント JS の更新のみで完結（SW の skipWaiting セマンティクス自体は不変）。
- **Trade-offs**: AC 1.1 の字面（`'autoUpdate'`）とは異なる。「skipWaiting + clientsClaim **相当**」を「ユーザー操作ゼロで最新化される**振る舞い**（無条件即時ではなく制御付き skipWaiting＋reload）」と解釈し design に明記する。
- **Follow-up**: `pwa-config.test.ts` の `expect(opts.registerType).toBe('prompt')` は**値としては引き続き真**だが、テスト名/意図（"requires user confirmation"）は「ガード付き自動駆動の基盤として prompt を維持する」契約へ書き換える（Req 6.4）。

### Decision: `saveStatus` をインスタンス id 付きレジストリ store で集約

- **Context**: 2 エディタ横断の「未保存/進行中/失敗があるか」を App 層で単一判定する必要（Req 2.1/2.3/2.5）。
- **Alternatives Considered**: (a) `useAutoSave` が単一スロットへ publish (b) 各エディタが mirror (c) インスタンス id レジストリ
- **Selected Approach**: 新規 `useSaveStatusStore`（`Record<instanceId, SaveStatus>`）。`useAutoSave` が `useId()` をキーに publish/clear。派生セレクタ `selectHasUnsavedWork` が `{pending, saving, error}` の存在を判定。
- **Rationale**: 単一スロット（a）はビュー遷移時の mount 重複で last-writer-wins クロバの恐れ。レジストリ（c）は N エディタに堅牢で、unmount 時の entry 削除が確実。publish を `useAutoSave` に置くことで 2 エディタを単一配線でカバー（drift 排除、将来の第 3 エディタも自動参加）。
- **Trade-offs**: `useAutoSave` が store に依存する。ただし対象 store は薄い UI store（`useEditorFocusStore` と同格）で、現行の 2 消費者は双方ともガード参加を望むため許容。非エディタ用途で再利用する場合は opt-out フラグで対応可（YAGNI 据え置き）。
- **Follow-up**: 状態機械（デバウンス・遷移）を一切変更しないこと（Req 2.6）。publish は `useEffect([saveStatus])` の副作用としてのみ追加。

### Decision: ガード付きリロードは one-shot、`error` 飢餓はデータ保護優先で許容

- **Context**: Req 1.6（リロード高々 1 回・ループ防止）と Req 2.3（`error` 時保留）。
- **Selected Approach**: オーケストレータが `appliedRef`（one-shot）で `updateServiceWorker(true)` を 1 サイクル 1 回に制限。`error` は blocking 集合に含めリロードを保留する。
- **Rationale**: `updateServiceWorker(true)` の二重発火と reload ループを防ぐ。`error` 保留は要件がデータ保護を最優先と明言済（Req 2.3）。
- **Trade-offs**: 保存が失敗し続けると更新が恒久保留され、削除済み UI が残り得る（Req 1/6 と緊張）。kill-switch は非導入（Req 3.4）。保存成功（settled 化）またはタブ全クローズ後の再訪で自然解消する経路を許容解とする。
- **Follow-up**: `applyUpdate` が reject した場合はログのうえ `appliedRef` を戻し、次サイクルで再試行可能にする（reload 未発火のためループにはならない）。自動リロード発火時に Sentry breadcrumb（`feature_area: 'system'`）を残し観測可能にする。

## Risks & Mitigations

- **チャンク 404（M2 採用時）** — M1 採用で構造的に回避（旧 SW が旧チャンクを配り続ける）。
- **リロードループ（Req 1.6）** — `appliedRef` one-shot ガードで 1 サイクル 1 回に制限。
- **`error` 飢餓（Req 2.3）** — データ保護優先で許容。settled 化／全タブクローズ後再訪で解消（kill-switch 非導入）。
- **1 世代遅れ（Req 3.1/3.4）** — M1/M2 共通の不可避制約。要件が許容済。client JS 更新の 1 サイクルで自然移行。
- **probe の多重発火 / オフライン** — `r.installing`・`navigator.onLine` チェックと 200 判定でスキップ。
- **`visibilitychange` リスナー競合（Req 4.4）** — `useMoriEffectControl` とは独立リスナー・共有状態なしで併存可。

## References

- [Auto Update — vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/auto-update.html) — autoUpdate の挙動とデータ損失警告
- [Prompt for Update — vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html) — `updateServiceWorker(reloadPage)` の制御点
- [Periodic Service Worker Updates — vite-plugin-pwa](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates.html) — `onRegisteredSW` 定期 probe パターン・推奨間隔
- `.kiro/specs/pwa-sw-auto-update/gap-analysis.md` — 現状調査と機構二択の事前評価
- `.kiro/specs/onboarding-removal/verification.md` — 本番検証記録の前例（Req 6.3）

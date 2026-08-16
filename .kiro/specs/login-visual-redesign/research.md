# Research & Design Decisions

---

## Summary

- **Feature**: `login-visual-redesign`
- **Discovery Scope**: Extension（既存authUIコンポーネントのスタイル拡張）
- **Key Findings**:
  - `frontend/public/themes/mori/mori.css` に深緑テーマのカラー変数が定義済み（`#00552e` / `#86efac` / `#22c55e`）。ログイン画面はこのパレットを流用する
  - 全authコンポーネントはTailwindクラスを直接記述しており、CSS ModulesやStyled Componentsは使用していない。スタイル変更はクラスの置き換えのみで対応可能
  - `OAuthLoginButton.tsx` は `EmailAuthForm.tsx` でのみ使用されているが、今後の拡張性を考え `variant` propで対応する
  - Canvas APIはターゲットブラウザ（モダンブラウザ）で標準サポートされており、ポリフィル不要
  - パーティクル・アニメーション実装に外部ライブラリは不要（Req 6.2 の制約）

## Research Log

### 既存コンポーネント構造の把握

- **Context**: どのファイルを変更するか特定するため
- **Sources Consulted**: `frontend/src/components/auth/` 配下のファイル一覧
- **Findings**:
  - `AuthForm.tsx`: モード管理・OAuth状態管理のロジックハブ。レンダリングは子コンポーネントに委譲
  - `EmailAuthForm.tsx`: メール/パスワード認証フォーム本体。`bg-white rounded-lg shadow-md` が白カードの根源
  - `OAuthInviteForm.tsx`: OAuthユーザーの招待コード入力。`providerStyles` ディクショナリでプロバイダー別色定義
  - `PasswordResetForm.tsx`: パスワードリセットフォーム。`bg-white rounded-lg shadow-md` パターン
  - `OAuthLoginButton.tsx`: プロバイダー別OAuth起動ボタン。`providerConfigs` で色定義
- **Implications**: ロジックは変更不要。スタイルクラスとラッパー構造のみ変更で完結する

### mori テーマのカラーパレット

- **Context**: 深緑森テーマの正確な色値を確認するため
- **Sources Consulted**: `frontend/public/themes/mori/mori.css`
- **Findings**:
  - 背景グラデーション: `linear-gradient(70deg, #00552e, #47885e)`
  - テキスト / 見出し: `#86efac`（淡い緑）
  - アクセント: `#22c55e`（エメラルド）
  - ボーダー: `#86efac`
  - 既存 `gradientShift` キーフレームで背景アニメーションの実績あり
- **Implications**: ログイン画面はmoriパレットを踏襲する。Tailwindの `emerald-*` / `green-*` ユーティリティと組み合わせる

### Canvas vs CSS アニメーション

- **Context**: パーティクルと背景アニメーションの実装方法選択
- **Sources Consulted**: MDN Web Docs（Canvas API、CSS Animation、prefers-reduced-motion）
- **Findings**:
  - CSS keyframeアニメーション: GPU加速、バンドル追加ゼロ、`prefers-reduced-motion` をmediaクエリで直接制御可能
  - Canvas API: 精密な座標制御とパーティクルライフサイクル管理が可能。`requestAnimationFrame` でフレームレート制御
  - Canvas の `pointer-events: none` でフォームのクリックを妨げない
- **Implications**: 霧・葉・波アニメーション → CSS keyframes。マウスパーティクル → Canvas（座標追跡のため）

## Architecture Pattern Evaluation

| オプション                  | 説明                                                     | 強み                               | リスク                                 | 採用判断 |
| --------------------------- | -------------------------------------------------------- | ---------------------------------- | -------------------------------------- | -------- |
| A: LoginPageLayout Wrapper  | 新しいラッパーコンポーネントに背景・アニメーションを集約 | AuthFormロジック無変更、関心の分離 | コンポーネント数増加                   | **採用** |
| B: AuthForm内に直接埋め込み | AuthForm.tsx に背景・Canvasを追加                        | ファイル数最小                     | AuthFormが肥大化、ロジックと視覚が混在 | 不採用   |
| C: HOC パターン             | withForestBackground(AuthForm)                           | 再利用性高                         | 過剰設計（ログイン画面専用）           | 不採用   |

## Design Decisions

### Decision: `LoginPageLayout` による背景・アニメーションのカプセル化

- **Context**: 背景グラデーション・霧アニメーション・パーティクルをどこで管理するか
- **Alternatives Considered**:
  1. AuthForm内直接実装 — 簡単だがロジックと視覚が混在
  2. LoginPageLayout Wrapper — 関心を分離し、AuthFormのロジックを無変更で保持
- **Selected Approach**: `LoginPageLayout.tsx` を新設し、AuthFormをラップする形で背景レイヤーを提供
- **Rationale**: AuthFormのモード管理・OAuth状態管理ロジックは複雑なため手を入れたくない。Req 5.6 「ロジック変更なし」を満たす
- **Trade-offs**: コンポーネントが1つ増えるが、責務分離の恩恵が大きい
- **Follow-up**: AuthFormをLazyLoadする場合、LoginPageLayoutのスケルトン表示を検討

### Decision: `OAuthLoginButton` への `variant` prop追加

- **Context**: OAuthLoginButtonはEmailAuthForm以外でも将来使われる可能性がある
- **Alternatives Considered**:
  1. グローバル変更 — 全箇所が森テーマになる
  2. variant prop — 呼び出し側で選択可能
- **Selected Approach**: `variant?: 'default' | 'forest'` propを追加。EmailAuthFormでは `variant="forest"` を渡す
- **Rationale**: 既存の他コンポーネント（将来実装）との互換性を維持する
- **Trade-offs**: prop追加によるインターフェース変更が発生するが、破壊的変更ではない（optional）

### Decision: `useReducedMotion` フックの作成

- **Context**: `prefers-reduced-motion` 対応をどこで処理するか
- **Alternatives Considered**:
  1. CSS media queryのみ — CSSアニメーションには有効だがJS（Canvas）には効かない
  2. `useReducedMotion` フック — CSS・Canvas両方を制御可能
- **Selected Approach**: `frontend/src/hooks/useReducedMotion.ts` を新設し、`window.matchMedia` でリアクティブに検出
- **Rationale**: Req 2.5・3.5 を一元的に満たせる。将来的に他のアニメーションコンポーネントでも再利用可能
- **Trade-offs**: 小さなフック追加のみ。デメリットなし

## Risks & Mitigations

- Canvas 描画によるCPU過負荷 — `requestAnimationFrame` でフレームレート上限60fps、パーティクル同時存在数に上限を設ける（最大50個）
- スマートフォンでのパーティクルパフォーマンス — タッチデバイス判定（`!window.matchMedia('(pointer:fine)').matches`）でCanvas非表示
- 霧・葉アニメーションとフォームのz-index競合 — 背景レイヤーに `pointer-events: none` + `z-index` の明確な階層設計
- `AuthForm.tsx` のOAuthコールバック処理への意図しない影響 — ロジック変更ゼロを守り、スタイルのみ変更

## References

- MDN: [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- MDN: [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- MDN: [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- `frontend/public/themes/mori/mori.css` — 深緑カラーパレットの参照元

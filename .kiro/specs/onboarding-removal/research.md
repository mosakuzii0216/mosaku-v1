# Research & Design Decisions — onboarding-removal

---

**Purpose**: 機能削除（オンボーディング）にあたり、削除安全性・取りこぼし・順序依存を実コードで検証した記録。

---

## Summary

- **Feature**: `onboarding-removal`
- **Discovery Scope**: Extension（既存システムからの機能除去 / Light Discovery）
- **Key Findings**:
  - オンボーディングは **他モジュールから逆参照されない単方向依存の独立機能**。`OnboardingModule` → `Notebook/Memo/Prisma` の依存はあるが逆は無く、丸ごと切り離して他ドメインに波及しない。
  - **R1.5「既存テーマ設定 UI」の実体は設定画面ではなく `NotebookEditor.tsx` のノートブック単位テーマドロップダウン**（`useSystemThemes`）。`components/settings/SettingsPage.tsx` にテーマ選択 UI は存在しない。オンボーディング削除後もテーマ選択導線は `NotebookEditor` 経由で維持される。
  - **バックエンドの型は自動カスケード**: `AuthenticatedUser = Omit<User, 'password'>`、`getMe` は `findUserById` の戻り値を素通しするだけ（明示 select なし）。schema からカラム drop + `npx prisma generate` で `onboardingCompleted` は型・レスポンスから自動消滅。手動型編集は backend 不要。
  - **要件の削除列挙に取りこぼし**: `auth.controller.spec.ts` の getMe テスト群（L604-653）が `onboardingCompleted` に依存。フロントは `useOnboardingQueries.test.ts` も削除対象（要件はフックのみ明記）。
  - **保護対象の確認**: `onboarding@resend.dev` はメール送信元デフォルト値。`config.service.ts` L102 / `config.service.spec.ts` L292-294 / `mail.service.spec.ts` L26 の 3 箇所に出現するが **全て無関係（メール機能）なので触らない**。

## Research Log

### オンボーディング参照の全数把握

- **Context**: 削除漏れ・逆参照の有無を確定するため。
- **Sources Consulted**: `grep -rniI "onboarding" backend/src frontend/src backend/prisma`
- **Findings**: 参照ファイルは下表の通り。機能本体（削除対象）とメール送信元（保護対象）の 2 系統に明確に分離される。
  | 区分 | ファイル | 扱い |
  | --- | --- | --- |
  | 本体(BE) | `backend/src/onboarding/`（controller/service/dto/module + spec×2） | ディレクトリ削除 |
  | 本体(BE) | `backend/src/app.module.ts` L12, L46 | import/登録解除 |
  | 本体(BE) | `backend/src/auth/auth.controller.spec.ts` L604-653 | getMe テスト修正 |
  | 本体(DB) | `backend/prisma/schema.prisma` L159 | フィールド削除 + migration |
  | 本体(FE) | `frontend/src/components/onboarding/`（Gate/Modal/ThemeGallery/ThemePreviewCard + test×4） | ディレクトリ削除 |
  | 本体(FE) | `frontend/src/stores/useOnboardingStore.ts`(+test) | 削除 |
  | 本体(FE) | `frontend/src/hooks/useOnboardingQueries.ts`(+test) | 削除 |
  | 本体(FE) | `frontend/src/App.tsx` L22-23, L100-101 | import/JSX 除去 |
  | 本体(FE) | `frontend/src/utils/api.ts` L583-591 | 関数削除 |
  | 本体(FE) | `frontend/src/utils/api.test.ts`（onboarding テスト） | 削除 |
  | 本体(FE) | `frontend/src/utils/auth.ts` L11 `UserProfile.onboardingCompleted` | フィールド削除 |
  | **保護** | `backend/src/config/config.service.ts` L102 `onboarding@resend.dev` | **変更禁止** |
  | **保護** | `backend/src/config/config.service.spec.ts` L292-294 | **変更禁止** |
  | **保護** | `backend/src/mail/mail.service.spec.ts` L26 | **変更禁止** |
- **Implications**: 削除と保護の境界が文字列 `onboarding` の文脈で明確に分かれる。`onboarding@resend.dev` を巻き込まないことを実装時の checklist に固定。

### R1.5 テーマ選択導線の実在検証

- **Context**: 要件 1.5「除去後もテーマ選択を既存のテーマ設定 UI 経由で提供」の前提が成立するか。
- **Sources Consulted**: `ls frontend/src/components/settings/`、`grep useSystemThemes/useThemeQueries`
- **Findings**: `SettingsPage.tsx` にテーマ選択 UI は無い（Invitation / PublicMemos カードのみ）。テーマ選択は `NotebookEditor.tsx`（L199 `useSystemThemes`、L299 `setThemeId`）のノートブック編集フォーム内ドロップダウンに実装されている。`ThemeGallery`（onboarding 配下）は onboarding 専用で他から参照されない。
- **Implications**: オンボーディング配下の `ThemeGallery`/`ThemePreviewCard` を削除してもユーザーのテーマ選択能力は `NotebookEditor` 経由で完全に維持される。R1.5 は **新規 UI 追加不要**で充足。design では「導線は NotebookEditor」と明記。

### getMe テストの依存構造

- **Context**: カラム drop 後にどのテストが赤化するか、修正方針（削除 vs モック値除去）を確定するため。
- **Sources Consulted**: `auth.controller.spec.ts` L601-654 を精読。
- **Findings**: getMe describe 配下に 3 テスト。
  1. L604「`onboardingCompleted: true` がレスポンスに含まれること」→ 存在意義が `onboardingCompleted` のアサートそのもの。**テストごと削除**。
  2. L621「`onboardingCompleted: false` でも含まれること」→ 同上。**テストごと削除**。
  3. L638「`findUserById` を `req.user.id` で呼ぶこと」→ 検証対象は呼び出し引数。モック値に `onboardingCompleted: false` を含むのみ。**モック行のみ除去しテストは残す**。
- **Implications**: 「2 件削除 + 1 件モック値除去」の混合操作。単純な全削除でも全残しでもない点を design・tasks に明記。

## Architecture Pattern Evaluation

| Option                          | Description                                         | Strengths                                                          | Risks / Limitations                                                       | Notes             |
| ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------- |
| A: 単一パス完全削除（採用）     | 3 層 + DB + 取りこぼしテストを 1 スペックで一括除去 | 中間の型不整合を残さない / dead code ゼロを一度に達成 / 認知負荷低 | DB drop と `prisma generate` → 型チェックの順序を 1 PR 内で正しく組む必要 | gap-analysis 推奨 |
| B: 段階削除（FE 先行→BE/DB）    | PR を層ごとに分割                                   | 個別レビュー容易                                                   | 中間状態で型・契約の不整合ウィンドウ。小規模機能では分割利得が薄い        | 不採用            |
| C: カラム温存（コードのみ除去） | DB は据え置き                                       | 本番 migration 不要                                                | Req 4（カラム削除）未達 / dead column 残存                                | 不採用            |

## Design Decisions

### Decision: 作業順序を「コード除去 → schema 編集 → prisma generate → 型チェック/テスト」に固定

- **Context**: `AuthenticatedUser` 型は Prisma の `User` 型から派生。カラム drop 後に `prisma generate` を回さないと型が旧フィールドを保持し、型チェックがすり抜ける/誤検知する。
- **Alternatives Considered**:
  1. schema を先に編集 → generate → コード除去：generate 直後にコード側が旧フィールド参照で大量赤化し、作業中の混乱が大きい。
  2. コード除去を先行 → schema 編集 → generate（採用）。
- **Selected Approach**: ①全コード/テストから `onboardingCompleted` 参照と onboarding モジュールを除去 → ②`schema.prisma` からフィールド削除 → ③`npx prisma migrate dev`（forward migration 生成 + 適用 + generate）→ ④frontend/backend 型チェック・テスト・lint。
- **Rationale**: pre-push フックが `prisma generate → ESLint → 型チェック` を回す設計（CLAUDE.md）と整合。順序を守ればローカルで CI 同等の検知が効く。
- **Trade-offs**: 順序の厳守が必要だが、中間状態の不整合を最小化できる。
- **Follow-up**: 本番は `prisma migrate deploy`（R4.4）。ロールバックは「再 add migration」で対応可。

### Decision: backend の型は手動編集せず prisma generate に委ねる

- **Context**: 要件は「`UserProfile`（FE）のフィールド削除」を明記するが、BE の `AuthenticatedUser` / `getMe` レスポンスの扱いが曖昧。
- **Selected Approach**: BE 側は `schema.prisma` のフィールド削除 + `prisma generate` のみで `Omit<User,'password'>` から自動消滅させ、`auth/types.ts` や `auth.controller.ts` は編集しない。
- **Rationale**: `getMe` は `findUserById` 戻り値を素通し。明示 select が無いため型カスケードが自動で効く。手動編集は不要かつ差分を増やすだけ。
- **Trade-offs**: 「generate を必ず実行」という運用前提に依存。順序固定で担保。

### Decision: getMe テストは「2 件削除 + 1 件モック値除去」

- **Context**: R5.4 は `onboarding/*.spec.ts` のみ削除対象に挙げ auth spec を取りこぼし。
- **Selected Approach**: L604/L621 の 2 テストは存在意義が消えるため削除。L638 はモック値の `onboardingCompleted` 行のみ除去しテスト本体は残す。
- **Rationale**: テストの検証意図に沿って最小修正。`findUserById` 呼び出し検証は依然有効。

## Risks & Mitigations

- **auth テストの取りこぼし** — 要件の削除列挙に無い `auth.controller.spec.ts` を design スコープに正式編入（R5.3/5.4 を満たす）。
- **順序依存（generate 漏れ）** — design に作業順序を固定。pre-push フックでローカル検知。
- **保護対象の誤削除** — `onboarding@resend.dev`（3 箇所）を「変更禁止」として checklist 化。
- **migration の本番適用漏れ** — R4.4 のとおり `prisma migrate deploy` をデプロイ手順に含める。既存 `20260608230032_add_onboarding_completed` は履歴として保持（編集禁止）。

## References

- `.kiro/specs/onboarding-removal/gap-analysis.md` — 実装ギャップ分析（本 research の起点）
- `.kiro/steering/structure.md` — ドメインモジュール構成・FE ディレクトリ規約
- `.kiro/steering/tech.md` — Prisma client 生成・JWT Guard・型安全方針
- `CLAUDE.md` — pre-push フック（prisma generate → ESLint → 型チェック）

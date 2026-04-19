# Mosaku 進捗ログ

毎週末に更新する進捗ログ。計画書（`docs/project-plan-2026.md`）は方針・計画を、本ファイルは**実際に何が起きたか**を記録する。

- 形式: 新しいエントリは**先頭**に追記する（最新が上）
- 粒度: 週次（週末に1エントリ）
- 計画変更が発生した場合は本ファイルにメモした上で `docs/project-plan-2026.md` も更新する

---

## エントリフォーマット

```markdown
## YYYY-MM-DD（フェーズ名 / 状況サマリ）

### 今週やったこと

- 完了した spec / コミット / 意思決定を箇条書き

### 来週の予定

- 着手予定の spec / タスク

### ブロッカー・懸念

- なし、または具体的に

### メモ

- 数字（テーマ数 / テスト数 / FCP 等）や所感
```

---

## 2026-04-20（Phase 0完了 → Phase 1移行間）

### 今週やったこと

- **`mosaku-brand-theme` 実装完了**（28/28 タスク完了）
  - `mori` テーマを深緑の森ブランドテーマに全面リライト
  - テーマエフェクト基盤を新設（`ThemeEffectKey` 契約 / `themeEffectRegistry` / `ThemeEffectHost` / `useEditorFocusStore` / `useMoriEffectControl` / `useActiveTheme`）
  - エフェクトコンポーネントを `frontend/src/components/effects/` に集約（共通: `ForestAnimationLayer` / `ParticleCanvas`、mori専用: `mori/MoriEffectLayer`）
  - mori テーマレコードに `effectKey: 'mori'` メタデータを追加するマイグレーションを backend に投入
  - バンドル分離・ライフサイクル・a11y 検証テストを追加
- **`auth-register-invitation-refactor`** が `implementation-validated` で完了
- **CLAUDE.md 更新**（コミット `70431de`）
- **CI 改善**: Backend デプロイ認証を Workload Identity Federation に移行 / Artifact Registry 移行 / Slack 通知の安全化

### 来週の予定

- `mosaku-brand-theme` の `/kiro:validate-impl` 実行 → `spec.json` を `completed` に
- `/kiro:steering` で steering ファイルを再同期（今回手動で更新したが、コード進化に追従するため）
- Phase 1 の spec 3 本を `spec-init`：
  - `dogfooding-friction-log`（ドッグフーディング摩擦記録の運用と仕組み）
  - `sentry-integration`（バックエンド + フロントエンド）
  - `uptime-monitoring`（UptimeRobot 連携 + `/health` エンドポイント整備）
- 新規テーマ作成の素案（+3、計10テーマに向けて）

### ブロッカー・懸念

- なし

### メモ

- Phase 0 のリリース要件（コアリファクタ + 自動保存 + ゴミ箱 + Staging）は完了済み
- 計画外ボーナスとして 3 spec（`login-visual-redesign` / `oauth-providers-expansion` / `mosaku-brand-theme`）を実装。ブランド表現と認証選択肢が大きく強化された
- 開発プロセス: cc-sdd（仕様駆動開発）が定着。1 Todo = 1 Commit ルールも維持

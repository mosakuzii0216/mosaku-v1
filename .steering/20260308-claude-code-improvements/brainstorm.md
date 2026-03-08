# Claude Code 改善提案

## 1. CLAUDE.md のモジュール化（高優先度）

**現状**: 単一ファイルに全情報が集約されており、200行超で肥大化している。

**推奨**: `.claude/rules/` ディレクトリにルールを分割する。

```
.claude/rules/
├── architecture.md    # アーキテクチャ概要
├── backend.md         # NestJSパターン・Prisma注意事項
├── frontend.md        # Zustand/React Query/AuthContextパターン
├── database.md        # スキーマ要点・環境変数・よくある落とし穴
└── deployment.md      # デプロイアーキテクチャ
```

CLAUDE.md 本体は `@.claude/rules/backend.md` などの参照のみにして薄くする。

---

## 2. `@記法` による外部ドキュメント参照

**現状**: CLAUDE.md に内容を直接記載しているが、`docs/` 配下に詳細ドキュメントが既に存在している。

**推奨**: 既存の docs を直接参照させる。

```markdown
@docs/deployment/cloud-run.md
@docs/migration/overview.md
```

---

## 3. 階層 CLAUDE.md（バックエンド・フロントエンド分離）

**現状**: ルートの CLAUDE.md のみ。

**推奨**: サブディレクトリに特化した設定を置く。

```
backend/CLAUDE.md   # NestJS固有のルール・テストパターン
frontend/CLAUDE.md  # React/Vite固有のルール・コンポーネント規約
```

---

## 4. Hooks の導入

**現状**: Hooks は一切未設定。

| イベント                   | 用途                                                   |
| -------------------------- | ------------------------------------------------------ |
| `PostToolUse` (Edit/Write) | ファイル保存後に `npm run lint:fix` を自動実行         |
| `Stop`                     | セッション終了時に macOS 通知を送信                    |
| `UserPromptSubmit`         | `.env` や credentials の機密情報の誤貼り付けをブロック |

---

## 5. カスタムコマンドへの frontmatter 追加

**現状**: `add-feature.md`・`brainstorm.md` に frontmatter がない。

**推奨**:

```yaml
---
description: 新機能開発（要件定義→設計→実装→レビューの全フロー）
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, WebSearch
---
```

`allowed-tools` を明示することでセキュリティと意図が明確になる。

---

## 6. `settings.local.json` の整理

**現状**: 過去の一時的なコマンドや DB パスワードを含むエントリが蓄積されて肥大化している。

**対処**:

- 使い捨てコマンドのエントリを削除し、汎用パターンに統合
- **要注意**: `DIRECT_URL="postgresql://..."` を含むエントリは機密情報をファイルに残しているため早急に削除

---

## 優先度まとめ

| #   | 改善                                 | コスト | 効果                       |
| --- | ------------------------------------ | ------ | -------------------------- |
| 1   | `settings.local.json` の機密情報削除 | 低     | セキュリティリスク解消     |
| 2   | CLAUDE.md のモジュール化             | 中     | 保守性向上                 |
| 3   | Hooks 導入（lint 自動実行）          | 低     | 開発効率向上               |
| 4   | カスタムコマンドに frontmatter 追加  | 低     | 可読性・安全性向上         |
| 5   | 階層 CLAUDE.md                       | 中     | サブプロジェクト特化ルール |

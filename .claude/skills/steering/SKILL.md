---
name: steering
description: ステアリングファイルの作成・実装管理・振り返り記録を行うスキル
---

# ステアリング管理スキル

このスキルは4つのモードで動作します。コンテキストに応じて適切なモードを選択してください。

---

## モード1a: requirements.md のみ生成

要件定義ファイルを単独で生成します（`/add-feature` フェーズ1 で使用）。

### 手順

1. `CLAUDE.md` を読み、プロジェクトの規約とアーキテクチャを確認
2. `.claude/skills/steering/templates/requirements.md` を参照
3. `.steering/{YYYYMMDD}-{機能名}/requirements.md` を生成

### 生成時の注意

- brainstorm.md の有力候補・課題感を反映する
- 曖昧な表現を避け、受け入れ基準を具体的に記述する
- 機能スコープは「今回実装するもの」と「スコープ外」を明記する

---

## モード1b: design.md のみ生成

設計ファイルを単独で生成します（`/add-feature` フェーズ2 で使用）。

### 手順

1. 承認済みの `.steering/{YYYYMMDD}-{機能名}/requirements.md` を読み込む
2. `.claude/skills/steering/templates/design.md` を参照
3. `.steering/{YYYYMMDD}-{機能名}/design.md` を生成

### 生成時の注意

- 新規ファイルと修正ファイルを明確に分ける
- Prisma スキーマ変更がある場合は必ず記載する
- API エンドポイント・コンポーネント構成を具体的に記述する

---

## モード1c: tasklist.md のみ生成

タスクリストを単独で生成します（`/add-feature` フェーズ3 で使用）。

### 手順

1. 承認済みの `requirements.md` と `design.md` を読み込む
2. `.claude/skills/steering/templates/tasklist.md` を参照
3. `.steering/{YYYYMMDD}-{機能名}/tasklist.md` を生成

### 生成時の注意

- タスクは1つ30分以内で完了できる粒度に分割する
- 依存関係のあるタスクはフェーズで順序を制御する
- 各フェーズに「承認ゲート」の区切りが分かるようにコメントを入れる

---

## モード2: 実装管理

ステアリングファイルに基づいて実装を管理します。

### MUST（必須）

- `tasklist.md` を常に参照しながら実装する
- タスク完了時に `[ ]` → `[x]` に更新する
- 実装中に追加タスクが発生したら `tasklist.md` に追記する
- 全タスクが `[x]` になるまで作業を継続する

### NEVER（禁止）

- `tasklist.md` を見ずに実装を進める
- 未完了タスクを残して作業を終了する
- タスクをスキップする（大きすぎる場合はサブタスクに分割する）

### NestJS バックエンド実装時のチェックポイント

- Module に新しい Provider/Controller を登録したか
- DTO に `class-validator` デコレータを設定したか
- 保護エンドポイントに `@UseGuards(JwtAuthGuard)` を付けたか
- ユーザーリソースに `AuthorizationService.checkOwnership()` を実装したか
- Prisma スキーマ変更後に `npx prisma generate` を実行したか

### React フロントエンド実装時のチェックポイント

- API呼び出しは `API_BASE_URL` と `AuthTokenManager` を使用しているか
- サーバー状態は React Query で管理しているか
- クライアント状態は Zustand ストアで管理しているか

---

## モード3: 振り返り記録

実装完了後、`tasklist.md` の末尾に以下を追記します。

```markdown
## 実装後の振り返り

### 実装完了日
[YYYY-MM-DD]

### 計画と実績の差分

**計画と異なった点**:
- [変更内容と理由]

**新たに必要になったタスク**:
- [追加タスクと理由]

### 学んだこと

**技術的な学び**:
- [技術的知見]

**プロセス上の改善点**:
- [改善点]

### 次回への改善提案
- [提案内容]
```

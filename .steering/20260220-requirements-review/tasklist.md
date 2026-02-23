# バックエンド写経・見直し タスクリスト

## 完了済み（前セッション）

### 高優先度
- [x] X(Twitter) OAuth コードを完全削除
- [x] `@Public` デコレーターを `common/decorators/` に移動
- [x] `AuthService` を `JwtTokenService` + `OAuthService` に分割
- [x] OAuth 設定のデフォルト値 `'not-configured'` を除去（`undefined | string` + Strategy 起動時バリデーションに変更）

### 中優先度
- [x] `AdminGuard` を新規作成して `InvitationController` に適用
- [x] Theme の `isSystem` / `isPublic` の関係をドキュメント化（requirements.md 末尾に記載）

### 低優先度
- [x] `public.decorator.ts` を `common/decorators/` に移動

### テスト
- [x] `AuthService` / `JwtTokenService` / `OAuthService` / `AdminGuard` のユニットテスト追加

---

## 残作業（中優先度: OAuth型定義の集約）

### フェーズ1: 型定義の整理
- [x] `GoogleProfile` を `google.strategy.ts` から `auth/types/oauth.types.ts` に移動
- [x] `GitHubProfile` を `github.strategy.ts` から `auth/types/oauth.types.ts` に移動
- [x] 各 strategy ファイルのインポートを更新

### フェーズ2: 検証
- [x] `npm run test` パス（backend） — 41 tests passed
- [x] `npm run lint` パス（backend） — 0 errors（既存 warning のみ）
- [x] `npm run build` パス（backend）

---

## 実装後の振り返り

### 実装完了日
2026-02-22

### 計画と実績の差分

**計画と異なった点**:
- OAuth設定のデフォルト値（`'not-configured'`）は前セッションで既に対応済みだった（`undefined | string` + Strategy コンストラクタで起動時 throw に変更済み）
- 中優先度タスクの大半（AdminGuard、Theme ドキュメント）も前セッションで完了済みだった

**新たに必要になったタスク**:
- tasklist.md が未作成だったため、今回のセッションで新規作成が必要だった

### 学んだこと

**技術的な学び**:
- Passport Strategy の `validate()` メソッドの引数型（`GoogleProfile` / `GitHubProfile`）は、外部ライブラリ（passport-google-oauth20 / passport-github2）が返す形状をローカルで型定義したもの。これらも OAuth 型定義の一部として `oauth.types.ts` に集約するのが一貫性が高い
- `auth/types.ts`（一般 auth 型）と `auth/types/oauth.types.ts`（OAuth 固有型）の二層構造は適切な分離

**プロセス上の改善点**:
- ステアリングファイル作成時に tasklist.md を同時に作成しておくべきだった
- 高・中・低の優先度タスクをまたいで実装が進んだため、次回は優先度別にフェーズを明示すると管理しやすい

### 次回への改善提案
- 新機能開発コマンド `/add-feature` では requirements.md と同時に空の tasklist.md も生成する
- 低優先度タスク（TagService の `assignTagsToEntity` 整理）は別 steering として切り出して検討する

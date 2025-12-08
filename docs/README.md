# Mosaku ドキュメント

Mosakuプロジェクトの技術ドキュメント集です。

## 📋 目次

### 🚀 移行計画 (migration/)

クラウド移行に関する包括的な計画書です。

- **[移行計画概要](./migration/overview.md)** - 全体像、タイムライン、コスト見積もり
- **[Supabaseデータベース移行](./migration/supabase-database.md)** - PostgreSQL移行の詳細手順
- **[Supabase認証移行](./migration/supabase-auth.md)** - 認証システム移行の詳細手順
- **[Supabase認証削除チェックリスト](./migration/supabase-auth-deletion.md)** - 旧認証削除のチェックリスト
- **[Supabase OAuth招待実装](./migration/supabase-oauth-invitation.md)** - OAuth招待機能の実装詳細

### 📦 デプロイ (deployment/)

本番環境へのデプロイ手順です。

- **[Google Cloud Run](./deployment/cloud-run.md)** - バックエンドのCloud Runデプロイ手順
- **[Vercel](./deployment/vercel.md)** - フロントエンドのVercelデプロイ手順

### 🛠️ 開発 (development/)

開発に関するドキュメントです。

- **[Agents](./development/agents.md)** - エージェント関連のドキュメント

---

## 🏗️ アーキテクチャ

### 現在のアーキテクチャ (ローカル開発)
```
Docker Compose
├── Nginx (リバースプロキシ)
├── Frontend (React + Vite) :5173
├── Backend (NestJS) :3000
└── PostgreSQL :5432
```

### 移行後のアーキテクチャ (本番環境)
```
クラウドネイティブ
├── Vercel (フロントエンド + CDN)
├── Google Cloud Run (バックエンド)
└── Supabase (PostgreSQL + Auth)
```

---

## 📚 関連ドキュメント

プロジェクトルートにある主要ドキュメント：

- **[README.md](../README.md)** - プロジェクトの概要とセットアップ手順
- **[CLAUDE.md](../CLAUDE.md)** - Claude Code向けのプロジェクト説明書

---

## 🔄 ドキュメント更新履歴

- **2025-12-08**: ドキュメントをdocs/ディレクトリに整理
- **2025-11-30**: 移行計画ドキュメント作成
- **2025-11-28**: Supabase認証移行計画作成

---

## 💡 ドキュメント規約

### ファイル命名規則

- ケバブケース (kebab-case) を使用
- 日本語のタイトルは英語に翻訳してファイル名に使用
- 拡張子は `.md`

### ディレクトリ構造

- `migration/` - 移行計画関連
- `deployment/` - デプロイ手順関連
- `development/` - 開発関連

### 新しいドキュメントの追加

1. 適切なディレクトリにマークダウンファイルを作成
2. このREADME.mdの目次に追加
3. 関連ドキュメントへのリンクを設定

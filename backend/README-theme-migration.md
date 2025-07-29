# テーマデータ管理方法

## 概要

テーマデータは以下の2つの方法で管理できます：

1. **推奨: Prisma Migration** - 本番環境での確実なデータ管理
2. **代替: Seed Script** - 開発環境での手動実行

## 方法1: Prisma Migration（推奨）

### 特徴
- データベーススキーマと連動してテーマデータも管理
- 本番環境での確実なデプロイが可能
- バージョン管理が容易

### 使用方法

```bash
# 新しいテーマを追加する場合
1. src/data/theme-presets.ts を編集
2. npm run generate:theme-migration  # migration SQLを生成
3. npm run migration:apply          # migrationを適用

# 本番環境デプロイ時
npm run migration:deploy
```

### ファイル構成
```
backend/
├── src/data/theme-presets.ts           # テーマデータ定義
├── scripts/generate-theme-migration.ts # migration SQL生成スクリプト
└── prisma/migrations/
    └── 20250729103602_insert_theme_presets/
        └── migration.sql               # 生成されたSQL
```

## 方法2: Seed Script（代替）

### 特徴
- 開発環境での手動テーマデータ投入
- 既存のデータを削除してから投入

### 使用方法

```bash
npm run seed:themes
```

## テーマデータの構造

テーマは `src/data/theme-presets.ts` で以下の形式で定義：

```typescript
{
  name: 'テーマ名',
  description: 'テーマの説明',
  category: 'basic' | 'business' | 'study' | 'creative' | 'seasonal' | 'accessibility',
  isSystem: true,
  isPublic: true,
  styles: {
    version: '1.0',
    colors: { /* 色設定 */ },
    typography: { /* フォント設定 */ },
    layout: { /* レイアウト設定 */ },
    animations: { /* アニメーション設定 */ },
    accessibility?: { /* アクセシビリティ設定 */ }
  }
}
```

## パッケージスクリプト

```bash
# Migration関連
npm run generate:theme-migration  # テーマmigration SQLを生成
npm run migration:apply          # 開発環境でmigrationを適用
npm run migration:deploy         # 本番環境でmigrationを適用

# Seed関連（代替方法）
npm run seed:themes             # 手動でテーマデータを投入
```

## 注意事項

- 本番環境では必ずmigrationを使用してください
- テーマデータを変更した場合は、必ず新しいmigrationを作成してください
- seed scriptは開発環境でのみ使用し、既存データが削除されることに注意してください
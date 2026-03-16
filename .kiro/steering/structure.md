# Project Structure

## Organization Philosophy

モノレポ・ドメイン駆動。バックエンドは「1ドメイン = 1モジュール」、フロントエンドは「責務別ディレクトリ + featureごとのhook/store」で整理する。

## Directory Patterns

### Backend: ドメインモジュール

**Location**: `backend/src/{domain}/`
**Purpose**: 各ドメイン（memo, notebook, tag, theme, auth, invitation）の責務を完全にカプセル化
**Example**: `backend/src/memo/` → `memo.module.ts`, `memo.controller.ts`, `memo.service.ts`, `dto/`

### Backend: 共通基盤

**Location**: `backend/src/common/`, `backend/src/prisma/`, `backend/src/config/`
**Purpose**: 横断的関心事（所有権チェック・DB接続・環境変数）
**Example**: `AuthorizationService.checkOwnership()` で所有権バリデーションを一元化

### Frontend: コンポーネント

**Location**: `frontend/src/components/{domain}/`
**Purpose**: UIコンポーネントをドメイン別に整理
**Example**: `components/memo/MemoEditor.tsx`, `components/tag/TagSelector.tsx`

### Frontend: サーバー状態フック

**Location**: `frontend/src/hooks/use{Domain}Queries.ts`
**Purpose**: React Query の `useQuery` / `useMutation` をドメインごとにまとめる。APIコールはここに集約
**Example**: `useMemoQueries.ts` → `useMemos()`, `useCreateMemo()`, `useUpdateMemo()`

### Frontend: クライアント状態ストア

**Location**: `frontend/src/stores/use{Domain}Store.ts`
**Purpose**: Zustand でUIの状態（表示モード・選択中ID・モバイル判定）を管理。サーバーデータは持たない
**Example**: `useViewStore.ts`（表示状態）、`useTagStore.ts`（選択タグ）

### テーマ CSS

**Location**: `frontend/public/themes/{category}/{name}.css`
**Purpose**: テーマごとの CSS 変数定義。DBにはパス・メタデータのみ保存
**Example**: `themes/nature/ocean-breeze.css`

## Naming Conventions

- **ファイル**: `kebab-case.ts`（バックエンド）、`PascalCase.tsx`（Reactコンポーネント）、`camelCase.ts`（hooks/stores/utils）
- **コンポーネント**: PascalCase
- **フック**: `use` プレフィックス + PascalCase（例: `useMemoQueries`）
- **DTO**: `{Action}{Domain}Dto`（例: `CreateMemoDto`, `UpdateTagDto`）

## Import Organization

```typescript
// Backend
import { Injectable } from '@nestjs/common'; // NestJS
import { PrismaService } from '../prisma/...'; // 内部モジュール（相対パス）
import { CreateMemoDto } from './dto/...'; // 同ドメイン内

// Frontend
import { useQuery } from '@tanstack/react-query'; // 外部ライブラリ
import { apiClient } from '../utils/api'; // 共通ユーティリティ
import { queryKeys } from '../constants/queryKeys'; // 定数
import type { CreateMemoDto } from '../types/memo'; // 型のみのimportは type を使う
```

## Code Organization Principles

- **所有権バリデーション**: サービス層で `AuthorizationService.checkOwnership()` を必ず呼ぶ
- **API コール**: フロントエンドでは `apiClient`（`utils/api.ts`）経由で統一。直接 `fetch` は禁止
- **認証ヘッダー**: `AuthTokenManager.getAccessToken()` で取得したトークンを `Authorization: Bearer` に付与
- **React Query キー**: `queryKeys` 定数（`constants/queryKeys.ts`）で一元管理

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_

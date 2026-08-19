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
**Example**: `AuthorizationService.validateOwnership()` で所有権バリデーションを一元化

### Frontend: コンポーネント

**Location**: `frontend/src/components/{domain}/`
**Purpose**: UIコンポーネントをドメイン別に整理
**Example**: `components/memo/MemoEditor.tsx`, `components/tag/TagManager.tsx`

### Frontend: サーバー状態フック

**Location**: `frontend/src/hooks/use{Domain}Queries.ts`
**Purpose**: React Query の `useQuery` / `useMutation` をドメインごとにまとめる。APIコールはここに集約
**Example**: `useMemoQueries.ts` → `useMemos()`, `useCreateMemo()`, `useUpdateMemo()`

### Frontend: ナビゲーションフック

**Location**: `frontend/src/hooks/useNavigation.ts`
**Purpose**: 複合ナビゲーションアクション（`goToEdit`, `goToList` 等）をまとめたフック。useViewStore + useMemoDataStore を組み合わせて状態遷移を一元化
**Pattern**: 複数ストアをまたぐナビゲーションは useNavigation 経由で呼び出す。コンポーネントが複数ストアに直接依存しないよう抽象化

### Frontend: クライアント状態ストア

**Location**: `frontend/src/stores/use{Domain}Store.ts`
**Purpose**: Zustand でUIの状態（表示モード・選択中ID・モバイル判定）を管理。サーバーデータは持たない
**Example**: `useViewStore.ts`（表示状態）、`useTagStore.ts`（選択タグ）

### テーマ CSS

**Location**: `frontend/public/themes/{category}/{name}.css`
**Purpose**: テーマごとの CSS 変数定義。DBにはパス・メタデータのみ保存
**Example**: `themes/nature/ocean-breeze.css`

### テーマエフェクト基盤

**Location**:

- `frontend/src/components/effects/` — エフェクトコンポーネント（共通: `ForestAnimationLayer` / `ParticleCanvas` / `ThemeEffectHost`、テーマ専用: `mori/MoriEffectLayer`）
- `frontend/src/themes/themeEffectRegistry.ts` — `effectKey → () => Promise<{ default: ComponentType }>` の静的マッピング（Vite のコード分割が効くよう import パスを文字列リテラルで固定）
- `frontend/src/hooks/useActiveTheme.ts` — 編集中メモ → 選択中ノートブック → null の優先順でアクティブテーマを解決
- `frontend/src/hooks/useMoriEffectControl.ts` — `prefers-reduced-motion` / エディタフォーカス / `visibilityState` / マウスアイドル の 4 条件を監視して `shouldRun` を返す
- `frontend/src/stores/useEditorFocusStore.ts` — TipTap のフォーカス状態を保持する Zustand ストア

**Purpose**: テーマごとの追加 JS エフェクト（背景・パーティクル等）をテーマ単位で動的ロードする。非エフェクトテーマには独立チャンクをロードしないことでバンドルを汚さない
**Pattern**: テーマ定義の `metadata.effectKey` でエフェクトを宣言 → `ThemeEffectHost` がレジストリ経由で `React.lazy` マウント → 共通エフェクトコンポーネントは `paused` prop で停止可能

### エディタ拡張（TipTap）

**Location**: `frontend/src/components/editor/`
**Purpose**: TipTap 拡張・スラッシュコマンド・構文ハイライト等エディタ機能を集約
**Pattern**: 拡張定義は共有ファクトリ `createEditorExtensions.ts` に一元化し、編集用 `RichTextEditor` と公開表示用 `PublicMemoRenderer` の両方が同じファクトリを使う。新しい拡張を追加する際はファクトリに足すことで編集と表示の差異を生まない。構文ハイライトは `lowlight.ts`（言語登録）+ `codeHighlight.css`、スラッシュコマンドは `slashCommand.ts` / `slashCommandItems.ts` / `SlashCommandList.tsx` に分離

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

- **所有権バリデーション**: サービス層で `AuthorizationService.validateOwnership()` を必ず呼ぶ
- **API コール**: フロントエンドでは `apiClient`（`utils/api.ts`）経由で統一。直接 `fetch` は禁止
- **認証ヘッダー**: `AuthTokenManager.getAccessToken()` で取得したトークンを `Authorization: Bearer` に付与
- **React Query キー**: `queryKeys` 定数（`constants/queryKeys.ts`）で一元管理
- **本文コンテンツと検索テキスト**: メモ/ノートブック本文は ProseMirror JSON（`content: Json`）を単一の真実の源泉とし、検索用の `contentText` は保存時に派生させる（BE: `extractPlainText`、FE オフライン: `utils/editor/prosemirrorText.ts`）。新しく本文を持つエンティティを足す場合も「JSON 本体 + 派生 contentText」パターンに従い、`content` を直接検索対象にしない

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_

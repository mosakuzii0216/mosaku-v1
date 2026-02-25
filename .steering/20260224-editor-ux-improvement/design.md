# エディタ体験の改善 の設計

## アーキテクチャ変更

### 新規追加ファイル
- `frontend/public/themes/kami/kami.css` - 紙っぽいテーマCSS
- `frontend/public/themes/code/code.css` - コードエディタ風テーマCSS
- `backend/prisma/migrations/20260224_add_kami_code_themes/migration.sql` - 新テーマのDB登録

### 修正ファイル
- `frontend/src/components/editor/RichTextEditor.tsx` - `focusKey` プロップ追加・フォーカス制御
- `frontend/src/components/memo/MemoEditor.tsx` - `focusKey={memo?.id || 'new'}` を渡す

---

## データモデル（Prismaスキーマ変更なし）

スキーマ変更は不要。既存の `themes` テーブルに INSERT のみ。

### マイグレーション

```sql
-- 新テーマ「kami」「code」の登録
INSERT INTO "themes" ("id", "name", "description", "isSystem", "isPublic", "css_file_path", "metadata", "createdAt", "updatedAt", "created_by_id") VALUES
('kami','紙','紙のノートのような温かみのあるテーマ',true,true,'kami/kami.css','{"version":"1.0","category":"style","variant":"paper","previewColor":"#faf8f3"}', NOW(), NOW(), NULL),
('code','Code','VSCode風のコードエディタテーマ',true,true,'code/code.css','{"version":"1.0","category":"style","variant":"code-editor","previewColor":"#1e1e1e"}', NOW(), NOW(), NULL);
```

既存データへの影響: なし（新規INSERTのみ）

---

## API 設計（バックエンド変更なし）

テーマCSSファイルは `frontend/public/` から静的配信されるため、APIの追加・変更は不要。

---

## フロントエンド設計

### 1. 自動フォーカス

**課題**: `autofocus` プロップはエディタ初期マウント時のみ有効。メモを切り替えても再マウントされないため、フォーカスが当たらない。

**解決策**: `focusKey` プロップを `RichTextEditor` に追加し、値が変化したときに `editor.commands.focus()` を呼ぶ。

```tsx
// RichTextEditor.tsx の変更
interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  autofocus?: boolean;
  focusKey?: string;  // 追加: 変化するとフォーカスを当てる
}

// focusKey が変化したらフォーカス
React.useEffect(() => {
  if (editor && focusKey !== undefined) {
    editor.commands.focus('end');
  }
}, [focusKey, editor]);
```

```tsx
// MemoEditor.tsx の変更
<RichTextEditor
  content={content}
  onChange={setContent}
  placeholder="メモを入力..."
  className="h-full"
  autofocus={isCreate}
  focusKey={memo?.id || 'new'}  // 追加
/>
```

### 2. テーマCSS設計

#### kami.css（紙っぽいテーマ）

設計方針:
- 背景: クリーム色の単色（グラデーションなし）でシンプルなページ感
- フォント: セリフ体（読書的な体験）
- box-shadow でページ感を演出
- 暖色系のテキスト・アクセント

主要CSS変数:
```css
--theme-bg: #faf8f3;
--theme-text-color: #3d2b1f;
--theme-heading-color: #2c1d14;
--theme-accent-color: #8b6f47;
--theme-border-color: #d4c4a8;
--theme-font-family: 'Noto Serif JP', 'Georgia', serif;
--theme-font-size: 16px;
--theme-line-height: 2.0;
--theme-padding: 3rem;
--theme-border-radius: 0;
```

#### code.css（コードエディタ風テーマ）

設計方針:
- VSCode の One Dark Pro 風
- モノスペースフォント
- シャープなエッジ（border-radius 最小）
- コンパクトな行間

主要CSS変数:
```css
--theme-bg: #1e1e1e;
--theme-text-color: #d4d4d4;
--theme-heading-color: #9cdcfe;
--theme-accent-color: #569cd6;
--theme-border-color: #3e3e3e;
--theme-font-family: 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
--theme-font-size: 14px;
--theme-line-height: 1.6;
--theme-padding: 2rem;
--theme-border-radius: 2px;
```

### コンポーネント構成（変更なし）

`MemoEditor` → `RichTextEditor` の構成は維持。

### 状態管理（変更なし）

テーマはノートブック単位で管理される既存の仕組みを使用。

---

## エラーハンドリング

- テーマCSSが404の場合: `useThemeCSS` が既にエラーをキャッチし、スタイルなしで表示（既存動作）
- `focusKey` 未指定の場合: `useEffect` の依存配列に `focusKey` があるので `undefined` のままでもエラーなし

---

## テスト方針

### バックエンド
- マイグレーションのみ。ユニットテスト不要。

### フロントエンド
- 手動確認:
  1. 既存メモをクリック → エディタにフォーカスが当たることを確認
  2. 別のメモに切り替え → 再度フォーカスが当たることを確認
  3. ノートブックに「kami」テーマを設定 → 紙っぽいデザインになることを確認
  4. ノートブックに「code」テーマを設定 → コードエディタ風になることを確認
  5. 既存テーマ（ao, aka など）が壊れていないことを確認

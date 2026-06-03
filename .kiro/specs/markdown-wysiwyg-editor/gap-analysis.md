# Gap Analysis — markdown-wysiwyg-editor

> 要件（requirements.md）と既存コードベースのギャップを分析し、design フェーズの判断材料を提供する。
> **本書は情報提供であり、実装方式の最終決定は行わない。**

## 1. 現状調査（Current State）

### 対象ファイルと役割

| ファイル                                                | 役割                                                                         | 本機能との関係                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `frontend/src/components/editor/RichTextEditor.tsx`     | TipTap エディタ本体（StarterKit + Placeholder + Mention、ツールバー内蔵）    | **改修の中心**。content 同期 useEffect が Req1 のバグ源                           |
| `frontend/src/components/editor/suggestion.ts`          | `/` トリガー Mention の suggestion ロジック（tippy + ReactRenderer）         | Req3 スラッシュコマンドの拡張対象。現状は「notebook」入力後にノートブック一覧のみ |
| `frontend/src/components/editor/SlashCommandList.tsx`   | スラッシュコマンドの候補リスト UI（上下キー/Enter/クリック）                 | Req3 の UI 基盤。冒頭に `TODO: コマンドの設計からやり直し` あり＝未完成           |
| `frontend/src/components/memo/MemoEditor.tsx`           | RichTextEditor の呼び出し元。`content` state と `scheduleAutoSave` を配線    | Req1/Req8 の content↔自動保存ループの当事者                                       |
| `frontend/src/components/notebook/NotebookEditor.tsx`   | RichTextEditor のもう一つの呼び出し元                                        | 非回帰の対象（Req9）                                                              |
| `frontend/src/hooks/useAutoSave.ts`                     | 編集停止デバウンス保存（既定 `debounceMs=200`、MemoEditor 側で渡す値要確認） | Req8 の整合先。`scheduleAutoSave` を onChange から叩く設計                        |
| `frontend/src/components/public/PublicMemoRenderer.tsx` | 公開メモの読み取り専用レンダラ（**StarterKit のみ**）                        | **Req9.4 の重大ギャップ**（後述）                                                 |
| `frontend/src/stores/useEditorFocusStore.ts`            | TipTap フォーカス状態の Zustand ストア                                       | Req9.3 テーマエフェクト連携。onFocus/onBlur で更新中                              |

### 既存の技術的事実（重要）

- **TipTap `3.22.2`** 系で統一。`@tiptap/react` / `starter-kit` / `extension-mention` / `extension-placeholder` / `suggestion` がインストール済み。
- **StarterKit v3.22.2 が内蔵する拡張**（`node_modules/@tiptap/starter-kit/package.json` で確認済み）:
  - `heading` / `bulletList` / `orderedList` / `blockquote` / `bold` / `italic` / `strike` / `code`（インラインコード）/ `codeBlock` / **`horizontalRule`** / **`link`** / `underline` / `listKeymap` / `hardBreak` ほか。
  - → **Req2（基本ショートカット）・Req6（区切り線）・Req7（リンク）の input rules は StarterKit に既に存在**。つまり「効かない」のは拡張不足ではなく **Req1 のバグが input rules 成立を阻害しているため**という仮説と整合する。
- **未インストール（Req4/Req5 で新規依存が必要）**:
  - `@tiptap/extension-code-block-lowlight` / `lowlight` / `highlight.js`（Req4 シンタックスハイライト）
  - `@tiptap/extension-task-list` / `@tiptap/extension-task-item`（Req5 チェックリスト）
- **Mention の char を `/` に変更**して流用しているため、`/` は「ノートブック参照」専用トリガーになっている（`RichTextEditor.tsx:46-54`）。Req3 はこれをブロック挿入メニューへ拡張しつつ共存させる必要がある。

### Req1 バグの所在（コード根拠）

```tsx
// RichTextEditor.tsx:81-85
React.useEffect(() => {
	if (editor && content !== editor.getHTML()) {
		editor.commands.setContent(content);
	}
}, [content, editor]);
```

- onUpdate → `onChange(editor.getHTML())`（59行）→ MemoEditor が `setContent(val)`（366行）→ 再レンダリングで本 useEffect が走る。
- `content` と `editor.getHTML()` の文字列比較は HTML 直列化の揺れ（属性順・空ノード等）や **input rule 変換途中の中間状態**で不一致になり得て、`setContent` が ProseMirror トランザクションを巻き戻す → input rule（`# `→H1 等）が成立しない、というのが要件の仮説。
- なお `setContent` は既定で update を emit するため、外部反映が再び onChange を誘発し **保存ループ**になる懸念（Req1.5 / Req8.4 が明示）。

## 2. 要件→資産マップ（ギャップタグ: ✅再利用 / 🔧改修 / ➕新規 / ⚠️要研究）

| Req                             | 必要能力                                                                  | 既存資産                                                    | ギャップ                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** input rules 復活          | content 同期の再設計（focus 中は setContent 抑止 / 等価判定 / emit 抑止） | `RichTextEditor.tsx:81-85`                                  | 🔧 useEffect 改修。⚠️ 等価判定とフォーカス判定の方式（`isFocused` / JSON 比較 / `setContent(..., {emitUpdate:false})`）は要研究                                                       |
| **2** 基本ショートカット        | H1-3/箇条書き/番号/引用/強調/取消線/インラインコード                      | StarterKit 内蔵 input rules                                 | ✅ ほぼ再利用。Req1 修正で成立見込み。H3 ツールバー無いが要件は記法のみ                                                                                                               |
| **3** スラッシュコマンド        | ブロック挿入メニュー＋ノートブック共存＋コードブロック内抑止＋絞り込み    | `suggestion.ts` / `SlashCommandList.tsx`（未完成）/ Mention | 🔧 大幅改修 or ➕別 Suggestion 拡張。⚠️ ① `/` を Mention 流用継続か独自 Suggestion 拡張へ分離か ② コードブロック内抑止（`allow` predicate）③ ノートブックサブメニュー方式             |
| **4** コードブロック+ハイライト | ` ``` ` 変換（StarterKit 済）+ 言語別ハイライト                           | StarterKit `codeBlock`（ハイライト無し）                    | ➕ `code-block-lowlight` + `lowlight` + `highlight.js` 追加。⚠️ 言語セット・バンドルサイズ・CSS テーマ                                                                                |
| **5** チェックリスト            | `[ ] ` 変換 / クリックトグル / Enter 継続 / 保存復元                      | なし                                                        | ➕ `task-list` + `task-item`（`nested:true`）追加。⚠️ HTML 保存の data 属性復元                                                                                                       |
| **6** 区切り線                  | `---`→hr、キャレット移動                                                  | StarterKit `horizontalRule`（input rule 内蔵）              | ✅ Req1 修正で成立見込み                                                                                                                                                              |
| **7** リンク自動化              | URL 自動リンク / 選択ペースト / 範囲非拡張                                | StarterKit `link`                                           | 🔧 `link.configure({ autolink, linkOnPaste })` 設定。⚠️ inclusive 範囲拡張の挙動・XSS（`protocols`/`rel`）                                                                            |
| **8** 自動保存整合              | 変更で onChange→2秒保存 / 新規ノードも HTML 出力 / 外部反映は保存しない   | `useAutoSave` / MemoEditor 配線                             | 🔧 Req1 と一体。⚠️ debounce 値が「2秒」要件と既定 200ms の乖離（MemoEditor の渡し値を確認）                                                                                           |
| **9** 非回帰                    | ツールバー/ノートブック参照/フォーカス連携/**公開表示**/初期フォーカス    | 既存テスト群・`PublicMemoRenderer`                          | ⚠️ **Req9.4 重大**: `PublicMemoRenderer` は StarterKit のみ。task-list/code-block-lowlight 等で保存された HTML を**正しく描画できない**（ノード脱落・崩れ）。同一拡張セット登録が必要 |

## 3. 実装アプローチ案

### Option A: RichTextEditor を拡張（既存ファイル中心）

- extensions 配列に Link 設定・CodeBlockLowlight・TaskList/TaskItem を追加し、content 同期 useEffect を改修。Slash は suggestion.ts を拡張。
- ✅ 変更ファイル最小・既存パターン踏襲・最速で Req1/2/6/7 が動く。
- ❌ RichTextEditor.tsx（既に 193 行・ツールバー同居）が肥大化。extension 設定の共有が PublicMemoRenderer と二重定義になりやすい。

### Option B: エディタ拡張設定を切り出し（新規モジュール）

- `editor/extensions.ts`（仮）に **共有 extension ファクトリ**を新設し、RichTextEditor と PublicMemoRenderer の両方が同じ拡張セットを使う。Slash は独自 Suggestion 拡張＋コマンド定義モジュールに分離。
- ✅ Req9.4 を構造的に解決（編集＝表示の拡張一致）。責務分離・テスト容易。
- ❌ 新規ファイル増・初期設計コスト。editable/non-editable の差分（autolink 等）を引数で出し分ける設計が要る。

### Option C: ハイブリッド（段階導入）— 推奨の方向性

- **Phase 1（土台）**: Req1 の content 同期バグのみ修正 → Req2/Req6/Req7（StarterKit 内蔵）を設定で有効化。新規依存ゼロ。
- **Phase 2（リッチ化）**: 共有 extension ファクトリ（Option B）へリファクタしつつ Req4/Req5 の新規拡張を追加。同時に PublicMemoRenderer を同ファクトリへ寄せて Req9.4 を担保。
- **Phase 3（Slash）**: suggestion を「ノートブック専用」からブロックコマンド＋ノートブックサブメニューへ拡張（Req3）。
- ✅ ブレスト/要件の段階方針（#1 が全土台）と一致。各 Phase を 1 Todo=1 Commit に割りやすい。リスクを小出しにできる。
- ❌ Phase 跨ぎの計画調整が必要。

## 4. Effort / Risk

| 範囲                           | Effort          | Risk             | 一言根拠                                                                             |
| ------------------------------ | --------------- | ---------------- | ------------------------------------------------------------------------------------ |
| Req1 content 同期修正          | S               | **Medium**       | 数行だが ProseMirror トランザクション/保存ループ理解が必要。リグレッション影響が広い |
| Req2/6/7（内蔵有効化）         | S               | Low              | StarterKit 内蔵、Req1 修正に従属                                                     |
| Req3 スラッシュコマンド        | M               | **High**         | 既存 Mention(`/`) との共存・コードブロック内抑止・未完成 UI の作り直し               |
| Req4 コードブロック+ハイライト | M               | Medium           | 新規依存3点・バンドル/言語セット/CSS の判断                                          |
| Req5 チェックリスト            | S〜M            | Low              | 拡張2点追加で定石。保存復元の確認のみ                                                |
| Req8 自動保存整合              | S               | Medium           | debounce 値整合・外部反映の非トリガー化                                              |
| Req9 非回帰（特に9.4）         | M               | **High**         | PublicMemoRenderer の拡張不一致は崩れ直結。既存テスト群の維持                        |
| **総合**                       | **L（1〜2週）** | **Medium〜High** | 土台は小さいが Slash と公開表示一致が難所                                            |

## 5. design フェーズへの申し送り（Research Needed）

1. **content 同期の正攻法**: `editor.isFocused` ガード / `setContent(content, { emitUpdate:false })` / JSON(`getJSON`)等価判定 のどれを採るか。TipTap v3 の `setContent` 既定 emit 挙動を要検証。
2. **Slash と Mention の共存方式**: ① Mention(`/`) を汎用 Suggestion 拡張に置換しノートブックを 1 コマンド化 ② Mention は維持し別トリガーを足す ③ サブメニュー方式。Req3.5/3.7（コードブロック内抑止＝`allow`）の実装可否込みで決定。
3. **公開表示の拡張一致（Req9.4）**: 編集側と `PublicMemoRenderer` の **共有 extension ファクトリ**化。non-editable 時の link/autolink・task-item クリック無効化の出し分け。
4. **自動保存 debounce**: 要件「2秒」と `useAutoSave` 既定 `200ms`、MemoEditor が渡す実値の確認と統一。
5. **コードブロックのハイライト方針**: `lowlight`(highlight.js) の言語サブセット選定とバンドルサイズ、CSS テーマ（既存テーマ CSS との両立）。tech.md の「エフェクト用新規 JS ライブラリは追加しない」方針は**テーマエフェクト限定**であり、エディタ機能拡張への適用可否を design で明文化。
6. **保存フォーマット**: 現状 HTML 保存。新規ノード（task-list の `data-checked`、code-block の言語属性）が HTML 往復で保持されるか要検証（Req4.5/5.4/8.3）。

---

## Analysis Summary

- **核心は Req1 の content 同期バグ**。`RichTextEditor.tsx:81-85` の `setContent` がタイプ中に走り input rules を潰している仮説とコードが整合。ここを直せば **Req2/6/7 は StarterKit 内蔵 input rules でほぼ自動的に成立**する（追加依存ゼロ）。
- **新規依存が要るのは Req4（code-block-lowlight + lowlight + highlight.js）と Req5（task-list/task-item）のみ**。Req3/6/7 はライブラリ追加不要。
- **最大の隠れリスクは Req9.4**: `PublicMemoRenderer` が StarterKit のみで、リッチ化後の保存 HTML を崩さず描画するには**編集側と同一の拡張セット共有**が必須。
- **Req3 スラッシュコマンドが最難所**: 既存 `/`=Mention(ノートブック専用) との共存、コードブロック内抑止、未完成 UI（TODO 残）の作り直しが絡む。
- **推奨方向は Option C（段階導入）**: Phase1=Req1土台 → Phase2=リッチ化＋共有ファクトリ化(Req9.4同時解決) → Phase3=Slash。総合 Effort **L**、Risk **Medium〜High**。

## Document Status

ギャップ分析を `gap-analysis.md` の framework（現状調査→要件マップ→A/B/C案→Effort/Risk→申し送り）に沿って実施。要件は `approved:false` だが、本分析は要件確定の判断材料にもなるため続行した（フォールバック方針どおり）。

## Next Steps

1. 本ギャップ分析と上記 Research Needed を確認。
2. `/kiro:spec-design markdown-wysiwyg-editor` で技術設計へ進む（要件を承認しつつ進める場合は `-y`）。
3. design では特に **§5 の 6 項目**（content 同期方式・Slash 共存・公開表示の拡張一致・debounce 整合・ハイライト方針・保存フォーマット往復）を決定すること。

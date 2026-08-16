# Research & Design Decisions — markdown-wysiwyg-editor

---

**Purpose**: design.md を支える discovery 結果・技術検証・意思決定の根拠を記録する。design.md 本文は自己完結させ、本書は背景・代替案・生ログを担う。

---

## Summary

- **Feature**: `markdown-wysiwyg-editor`
- **Discovery Scope**: Extension（既存 TipTap エディタの拡張・バグ修正）
- **Key Findings**:
  1. **Req1 バグの確定原因**: TipTap **v3 では `editor.commands.setContent` の `emitUpdate` がデフォルト `true`**（v2 は `false`）。現状コード `setContent(content)` はタイプ中に走り、(a) ProseMirror トランザクションを巻き戻して input rule を潰し、(b) update を emit して onChange→自動保存ループを誘発する。`{ emitUpdate: false }` ＋「自分が emit した HTML の echo を skip する」二段で解決可能。
  2. **StarterKit v3.22.2 が link / underline / horizontalRule / codeBlock / listKeymap / trailingNode を内蔵**。Req2・Req6・Req7 は**新規依存ゼロ**、設定（`StarterKit.configure({...})`）のみで成立。新規依存は Req4（code-block-lowlight + lowlight）と Req5（task-list/task-item）に限定。
  3. **v3 で TaskList/TaskItem は `@tiptap/extension-list` に統合**（gap-analysis が想定した `@tiptap/extension-task-list` / `-task-item` は v2 の旧パッケージ名）。`@tiptap/extension-list` は **StarterKit の依存として既に node_modules に存在**し、`import { TaskList, TaskItem } from '@tiptap/extension-list'` で利用できる。direct dependency としての追記のみで足りる。
  4. **公開表示（PublicMemoRenderer）は StarterKit のみ**。リッチ化後の保存 HTML を崩さず描画するには、編集側と**同一の拡張セットを共有**する必要がある（Req9.4）。→ 共有 extension ファクトリ化が構造的解。
  5. **自動保存 debounce 実値は 200ms**（MemoEditor は `debounceMs` を渡さずデフォルト 200ms を使用）。要件 8.1 の「2秒」と乖離 → Open Question として明記。

## Research Log

### Topic 1: Req1 content 同期バグの根本原因（v3 setContent 挙動）

- **Context**: `# ` 等の input rule がタイプ中に成立しない。gap-analysis の仮説（`RichTextEditor.tsx:81-85` の `setContent` がトランザクションを巻き戻す）を確定させる必要があった。
- **Sources Consulted**:
  - [setContent command | Tiptap Editor Docs](https://tiptap.dev/docs/editor/api/commands/content/set-content)
  - [setContent breaks undo · ueberdosis/tiptap Discussion #5708](https://github.com/ueberdosis/tiptap/discussions/5708)
- **Findings**:
  - v3 の `setContent(content, options)` で `emitUpdate` は **default `true`**（"this changed from false in v2"）。`parseOptions` も受ける。
  - 現状コードは options 無し呼び出しのため、外部反映・echo の双方で update を emit する。
  - 現フロー: `onUpdate → onChange(getHTML())`（59行）→ MemoEditor `setContent(val)`（366行）→ 再レンダリングで sync useEffect 発火 → `content !== editor.getHTML()` が **HTML 直列化揺れ / input-rule 中間状態**で真になり `setContent` 実行 → トランザクション巻き戻し。
- **Implications**:
  - 解決は2段構え:
    1. **echo 判定**: onChange で emit した HTML を ref（`lastEmittedHtmlRef`）に保持し、sync effect では `content === lastEmittedHtmlRef.current` のとき再適用を skip（タイプ中の自己エコーを正確に除外。HTML 再直列化に依存しないため揺れに強い）。
    2. **emit 抑止**: 真の外部変更時のみ `setContent(content, { emitUpdate: false })` で反映し、保存ループを断つ。
  - これで Req1.2/1.3（タイプ中 setContent 不実行）・1.4（外部反映）・1.5/8.4（保存ループ防止）・1.6（等価 skip）を同時に満たす。

### Topic 2: StarterKit v3.22.2 の同梱拡張と設定方法

- **Context**: Req2/4/6/7 でどこまでが内蔵で、新規依存が何かを確定する。
- **Sources Consulted**:
  - [StarterKit extension | Tiptap Editor Docs](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
  - `node_modules/@tiptap/starter-kit/package.json`（dependencies 実物確認）
- **Findings**:
  - 同梱: Document, Paragraph, Text, Heading, Blockquote, BulletList, OrderedList, ListItem, **ListKeymap (v3 新)**, CodeBlock, HardBreak, **HorizontalRule**, Bold, Italic, Strike, Code, **Link (v3 新)**, **Underline (v3 新)**, Dropcursor, Gapcursor, UndoRedo, TrailingNode (v3 新)。
  - サブ拡張設定は接頭プロパティで指定: `StarterKit.configure({ heading: { levels: [1,2,3] }, link: {...}, codeBlock: false })`。`false` で無効化（CodeBlock を CodeBlockLowlight へ差し替えるときに使用）。
  - TaskList/TaskItem は StarterKit に**含まれない**（別途登録が必要）。
- **Implications**:
  - Req2（H1-3・リスト・引用・強調・取消線・インラインコード）/ Req6（hr）/ Req7（link）は **StarterKit 内蔵 input rule** で成立。Req1 修正が前提。
  - Req4 は `StarterKit.configure({ codeBlock: false })` ＋ CodeBlockLowlight 追加。

### Topic 3: 新規依存（TaskList / CodeBlockLowlight）の v3 パッケージ実態

- **Context**: gap-analysis は `@tiptap/extension-task-list` / `-task-item` を新規依存と想定。v3 の正パッケージを確認。
- **Sources Consulted**:
  - [TaskList extension | Tiptap Editor Docs](https://tiptap.dev/docs/editor/extensions/nodes/task-list)
  - [CodeBlockLowlight extension | Tiptap Editor Docs](https://tiptap.dev/docs/editor/extensions/nodes/code-block-lowlight)
  - [@tiptap/extension-code-block-lowlight - npm](https://www.npmjs.com/package/@tiptap/extension-code-block-lowlight)
- **Findings**:
  - **v3 では TaskList/TaskItem が `@tiptap/extension-list` に統合**: `import { TaskList, TaskItem } from '@tiptap/extension-list'`。`@tiptap/extension-list` は StarterKit 依存として **既に node_modules に存在**（package.json への direct 追記のみ／バージョンは 3.22.2 で統一）。
  - TaskItem は `nested: true` でネスト可。input rule は行頭 `[ ]` / `[x]`。
  - `@tiptap/extension-code-block-lowlight`（v3 系、現行 3.23.x。本リポジトリは 3.22.2 で固定）＋ `lowlight`（3.x）。lowlight 3 は `createLowlight()` でインスタンス生成 → `register()` で言語登録。言語を絞ればバンドル削減可能。
- **Implications**:
  - 新規 direct dependency: `@tiptap/extension-list@3.22.2`（実体は既存）, `@tiptap/extension-code-block-lowlight@3.22.2`, `lowlight@^3`。`highlight.js` は lowlight の依存として入る（言語 grammar は lowlight 経由で個別 import）。
  - バンドル対策として言語は**キュレーション済みサブセット**を `createLowlight` に register（既定 common 言語: js, ts, json, html, xml, css, bash, shell, python, sql, markdown, diff など）。

### Topic 4: Slash コマンドと既存 `/` Mention の共存

- **Context**: 現状 `/` は `Mention.configure({ suggestion, char: '/' })` でノートブック専用トリガー（`RichTextEditor.tsx:46-54`）。`SlashCommandList.tsx` 冒頭に `TODO: コマンド設計やり直し`。Req3 はブロック挿入メニュー化＋ノートブック共存＋コードブロック内抑止。
- **Sources Consulted**: 既存コード（`suggestion.ts`, `SlashCommandList.tsx`）/ `@tiptap/suggestion`（インストール済み 3.22.2）
- **Findings**:
  - 現状の notebook 挿入は **Mention ノードではなくプレーンテキスト `[[name]]`** を `insertContent` している（`suggestion.ts:45`）。保存 HTML に mention ノードは残らない。
  - `@tiptap/suggestion` の `allow` predicate で `editor.isActive('codeBlock')` を見れば、コードブロック内のメニュー抑止（Req3.7）が可能。
- **Implications**:
  - Mention を流用継続するより、**`@tiptap/suggestion` ベースの専用 SlashCommand 拡張**へ分離する方が責務が明快（Mention 依存を外せる）。char `/`、`allow` でコードブロック抑止、`command` でブロック挿入。
  - ノートブック参照は **メニュー内の1コマンド**として提供し、選択でノートブック絞り込みモード（サブメニュー）へ遷移 → 確定で従来どおり `[[name]]` を挿入（Req3.5 / Req9.2）。既存の `notebooksData` 注入機構を流用。

### Topic 5: 自動保存 debounce 値の乖離

- **Context**: Req8.1 は「編集停止2秒後の自動保存」。実装値を確認。
- **Sources Consulted**: `frontend/src/hooks/useAutoSave.ts`（`debounceMs = 200` 既定）, `frontend/src/components/memo/MemoEditor.tsx:146`（`debounceMs` 未指定）
- **Findings**: MemoEditor は `useAutoSave` に `debounceMs` を渡さず、**実効 200ms**で動作。「2秒」は要件・CLAUDE.md 記述上の値で実装と乖離。
- **Implications**: 本機能の Req8 本質は「Markdown 由来の変更も既存の自動保存パイプラインに正しく乗る／外部反映は乗せない」。debounce 値の是正は auto-save フック側の関心事でありリグレッション波及が広い。→ **既存 200ms を踏襲**しつつ、値の不整合を Open Question として別途調整に委ねる。

## Architecture Pattern Evaluation

| Option                           | Description                                                                                | Strengths                                           | Risks / Limitations                                                             | Notes                                |
| -------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| A. RichTextEditor 内拡張         | extensions 配列に直接追記、useEffect 改修、suggestion.ts 拡張                              | 変更最小・最速                                      | RichTextEditor 肥大化、PublicMemoRenderer と拡張セット二重定義（Req9.4 未解決） | gap-analysis Option A                |
| B. 共有 extension ファクトリ新設 | `editor/extensions.ts` を両コンポーネントが共用、Slash を専用拡張へ分離                    | Req9.4 を構造的に解決、テスト容易、責務分離         | 新規ファイル・初期設計コスト                                                    | gap-analysis Option B                |
| **C. 段階導入（採用）**          | Phase1=Req1土台 → Phase2=共有ファクトリ化＋リッチ拡張(Req4/5)＋公開表示一致 → Phase3=Slash | 要件の段階方針と一致、1 Todo=1 Commit、リスク小出し | Phase 跨ぎの計画調整                                                            | gap-analysis 推奨。最終形は B に収束 |

→ **採用: Option C**。最終アーキテクチャは B（共有ファクトリ）に収束させ、導入を 3 Phase に分割する。

## Design Decisions

### Decision: content 同期の再設計（echo-ref + emitUpdate:false）

- **Context**: Req1。タイプ中 setContent がトランザクションを巻き戻し input rule を潰す。かつ emit による保存ループ懸念。
- **Alternatives Considered**:
  1. `editor.isFocused` ガードのみ — フォーカス中の setContent を抑止するが、blur 中の自己エコーや HTML 揺れには未対応。等価判定が別途必要。
  2. `getJSON()` 等価判定 — 構造比較で揺れに強いが、毎回 JSON 直列化のコスト・深い比較が必要。
  3. **echo-ref（採用）** — onChange で emit した HTML を ref に保持し sync effect で完全一致 skip ＋ 外部反映は `emitUpdate:false`。
- **Selected Approach**: onChange 時に `lastEmittedHtmlRef.current = html`。sync effect は `content === lastEmittedHtmlRef.current` で自己エコーを skip、`content === editor.getHTML()` で既存等価を skip、それ以外（真の外部変更）のみ `setContent(content, { emitUpdate: false })` ＋ ref 更新。
- **Rationale**: 自己エコーを「実際に emit した文字列」と突き合わせるため HTML 再直列化の揺れに影響されず、タイプ中の setContent を確実にゼロ化できる。emit 抑止で保存ループも断つ。数行で完結し既存パターンを壊さない。
- **Trade-offs**: ref 管理が増えるが、JSON 比較より軽量で意図が明確。
- **Follow-up**: 別メモ切替・新規作成・サーバー再取得の3経路で外部反映を E2E 確認。input rule（`# `）成立とその後の保存ループ不発を回帰テスト化。

### Decision: 共有 extension ファクトリ（編集＝表示の拡張一致）

- **Context**: Req9.4。PublicMemoRenderer が StarterKit のみで、task-list / code-block-lowlight 等の保存 HTML を崩す。
- **Alternatives Considered**:
  1. PublicMemoRenderer に同じ拡張を個別追記 — 二重定義で drift しやすい。
  2. **共有ファクトリ `createEditorExtensions(options)`（採用）** — 編集・公開の両方が同一拡張セットを取得。`editable` フラグで挙動差分（autolink/linkOnPaste、TaskItem クリック可否、Placeholder/Slash の有無）を出し分け。
- **Selected Approach**: `editor/extensions.ts` に `createEditorExtensions(options: EditorExtensionOptions): Extension[]` を新設。RichTextEditor は `{ editable: true, placeholder, slash: {...} }`、PublicMemoRenderer は `{ editable: false }` で呼ぶ。
- **Rationale**: ノード定義の単一情報源化で保存↔表示の構造一致を保証。テスト・将来拡張が容易。
- **Trade-offs**: 新規ファイル。editable 差分の引数設計が必要だが許容範囲。
- **Follow-up**: 公開表示でコードブロック・タスクリスト・hr・リンクが崩れず描画されるスナップショット／E2E を追加。

### Decision: Slash を `@tiptap/suggestion` 専用拡張へ分離

- **Context**: Req3。既存 `/` Mention（ノートブック専用）の置換とコードブロック内抑止。
- **Alternatives Considered**:
  1. Mention 流用継続＋別トリガー追加 — `/` 衝突を残す。
  2. **専用 SlashCommand 拡張（採用）** — `@tiptap/suggestion` を `addProseMirrorPlugins` で組み込み、char `/`、`allow` でコードブロック抑止、items にブロックコマンド＋ノートブック参照コマンド。
- **Selected Approach**: `editor/slashCommand.ts`（拡張）＋ `editor/slashCommandItems.ts`（コマンド定義）＋ 既存 `SlashCommandList.tsx` を作り直し。ノートブック参照は選択でサブメニュー（絞り込み）へ遷移し `[[name]]` を挿入。Mention 拡張は除去。
- **Rationale**: 責務分離・コードブロック抑止の predicate が自然・Mention 依存を外せる。
- **Trade-offs**: 未完成 UI の作り直しコスト。Req3 が最難所である事実は不変。
- **Follow-up**: コードブロック内で `/` がメニューを出さないこと、候補なしクエリで閉じる/空表示、上下キー・Enter・Esc・クリックの操作網羅をテスト。

## Risks & Mitigations

- **R1: Req1 修正のリグレッション波及（保存・別メモ切替）** — echo-ref + emitUpdate:false を E2E（入力→変換→保存→再読込→別メモ切替）で固める。`useAutoSave` のテスト群を非回帰確認。
- **R2: Req9.4 公開表示崩れ** — 共有ファクトリで構造的に防止。公開表示スナップショットテストを追加。
- **R3: Slash と既存ノートブック挙動のデグレ** — `[[name]]` 挿入の出力互換を維持。Mention 除去前後でノートブック参照 E2E を比較。
- **R4: lowlight バンドル肥大** — 言語をキュレーション済みサブセットに限定。動的 import 検討（Phase2 で計測）。
- **R5: debounce 値の要件乖離（200ms vs 2秒）** — Open Question 化。既存 200ms 踏襲を既定とし、変更可否は別途合意。
- **R6: highlight.js テーマ CSS と既存テーマ CSS の衝突** — エディタ専用スコープ下に highlight CSS を限定し、CSS 変数ベースの既存テーマと干渉させない。

## References

- [StarterKit extension | Tiptap Editor Docs](https://tiptap.dev/docs/editor/extensions/functionality/starterkit) — v3 同梱拡張・サブ拡張設定
- [setContent command | Tiptap Editor Docs](https://tiptap.dev/docs/editor/api/commands/content/set-content) — emitUpdate v3 default true
- [TaskList extension | Tiptap Editor Docs](https://tiptap.dev/docs/editor/extensions/nodes/task-list) — v3 で `@tiptap/extension-list` に統合
- [CodeBlockLowlight extension | Tiptap Editor Docs](https://tiptap.dev/docs/editor/extensions/nodes/code-block-lowlight) — lowlight 3 `createLowlight`
- [Upgrade v2 to v3 | Tiptap](https://tiptap.dev/docs/guides/upgrade-tiptap-v2) — v3 移行の API 差分

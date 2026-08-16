# Gap Analysis — content-jsonb-migration

> 目的: 承認済み requirements（8 要件）と既存コードベースのギャップを洗い出し、design フェーズの実装戦略判断に必要な情報・選択肢・研究項目を提供する。
> 注: 本書は「情報と選択肢」を提示するものであり、最終的な実装決定は行わない（design で確定）。

## 1. 分析サマリ

- **スコープ**: メモ／ノートブック本文を HTML 文字列（Prisma `String`）→ ProseMirror JSON（Prisma `Json` / PostgreSQL JSONB）へ移行する**フルスタック横断 + データ移行**。エディタ入出力・DTO/API・公開描画・検索・オフライン・移行スクリプトが対象。
- **最大の課題**:
  1. **HTML→JSON 変換は SQL 単独では不可能**でアプリ層の TipTap スキーマ変換が必須。しかし **backend には TipTap/ProseMirror 依存が一切無い**（`backend/package.json` に該当依存ゼロ）。Req2.2「`createEditorExtensions` と同一のノード定義で変換」と Req8.1「実行時バンドルへ外部 JS を増やさない」が緊張関係にある。
  2. **本文を文字列前提で扱う箇所が分散**: 検索 4 層（DB `contains` / offline repository / memo-bridge / MCP tool）＋プレビュー 2 層（dashboard / MCP excerpt）。すべて HTML 文字列を直接 slice / strip している。
  3. **データロスゼロ・ロールバック可能**（Req7）が至上命令。`ALTER COLUMN ... USING content::jsonb` は HTML 文字列に対して失敗するため、退避列＋アプリ変換の段階手順が必要。
- **朗報（既に満たされている / 容易な部分）**:
  - 公開ビュー `PublicMemoRenderer` は**既に TipTap 描画で `dangerouslySetInnerHTML` を不使用**（grep ヒット 0）→ Req5.3 はほぼ達成済。TipTap `useEditor({ content })` は HTML/JSON 両対応のため、描画側改修は**型と等価判定が中心**。
  - `useAutoSave` は content 型に非依存の汎用フック → Req8.2（5 状態・2 秒保存）の維持は容易。
  - last-write-wins は `clientUpdatedAt` ベースで content 型に依存しない → Req4.5 の維持は容易。
  - オフラインキャッシュは既に検索用プレーンテキスト `searchableText` を **content と分離して保持** → JSON 化と相性が良く、DB 側設計のヒントにもなる。
- **全体規模 / リスク**: **L〜XL / Risk High**（中核はデータ移行とデータロスゼロ制約）。
- **推奨方針（design へ）**: **Option C（段階ハイブリッド）**。退避列でロールバックを確保し、変換の単一情報源を `createEditorExtensions` に固定。**「変換ロジックの実行場所」と「JSONB 検索方式」を design の二大研究項目**として持ち越す。

---

## 2. 現状調査（ドメイン資産マップ）

### 2.1 エディタ／描画（frontend）

| 資産               | パス                                                                        | 現状                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 共有拡張ファクトリ | `frontend/src/components/editor/createEditorExtensions.ts`                  | StarterKit(H1〜3, link 制御) + CodeBlockLowlight + TaskList/TaskItem。編集・公開の**単一情報源**。Req2.2 の変換スキーマもここに一致させる必要                |
| 編集エディタ       | `components/editor/RichTextEditor.tsx`                                      | `content: string` props、`onUpdate` で **`editor.getHTML()`** を emit、`setContent(html)` で反映。自己エコー防止に `lastEmittedHtmlRef`（HTML 文字列）を保持 |
| content 同期純関数 | `components/editor/contentSync.ts`                                          | **HTML 文字列の 3 値一致比較**（`content === lastEmitted` 等）。Req3.4 で構造的等価へ要変更                                                                  |
| 公開描画           | `components/public/PublicMemoRenderer.tsx`                                  | `createEditorExtensions({editable:false})` に `content: string` を渡すだけ。**生 HTML 注入なし**                                                             |
| 公開ページ         | `components/public/PublicMemoView.tsx`                                      | `memo.content`（string）を Renderer へ受け渡し                                                                                                               |
| 編集ホスト         | `components/memo/MemoEditor.tsx` / `components/notebook/NotebookEditor.tsx` | `useState<string>(memo?.content ?? '')`、`content.trim()` 判定、`onChange` で setState + autosave。**両方とも文字列 state 前提**                             |
| 変換 API の所在    | （devDeps）                                                                 | `@tiptap/core` の `Editor` はテストで利用実績あり（`generateJSON`/`generateHTML` は同パッケージが提供）。ただし**実行時は DOM 依存**                         |

### 2.2 永続化／API（backend）

| 資産                 | パス                                                             | 現状                                                                                                                        |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Prisma スキーマ      | `backend/prisma/schema.prisma`                                   | `Memo.content String`（NOT NULL）/ `Notebook.content String?`。前例として `Theme.styles`/`metadata` は既に `Json?`          |
| メモ DTO             | `memo/dto/create-memo.dto.ts` / `update-memo.dto.ts`             | `@IsString() content`。Req4.1 で JSON 検証へ置換                                                                            |
| ノートブック DTO     | `notebook/dto/create-notebook.dto.ts` / `update-notebook.dto.ts` | `@IsString() @IsOptional() content?: string \| null`                                                                        |
| メモサービス         | `memo/memo.service.ts`                                           | `create` で `content` を直渡し。`update` は patch 直渡し（last-write-wins は型非依存）。`search` は `content: { contains }` |
| ノートブックサービス | `notebook/notebook.service.ts`                                   | `content` をそのまま create/update                                                                                          |
| 公開取得             | `memo/memo-sharing.service.ts`                                   | `findByToken` が `select:{content:true}` で返す。`PublicMemoView.content: string`                                           |
| 公開 API             | `memo/public-memo.controller.ts`                                 | `findByToken` 戻り値をそのまま返却（変換なし）                                                                              |

### 2.3 検索（⚠ 文字列前提が 4 箇所に分散）

| #   | 箇所                | パス:行                                        | 現状の前提                                                                                                                                                                                |
| --- | ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | DB 検索             | `memo/memo.service.ts:197 / 247`               | `content: { contains: query, mode:'insensitive' }`。**Prisma の `contains` は String 専用**。JSONB では型エラー、`content::text` 流用ではキー名/`"paragraph"` 等が誤ヒット（Req6.3 違反） |
| 2   | オフライン検索      | `utils/offline/repository.ts:319-350`          | `memo.searchableText`（= `stripHtml(content)`）を `indexOf` 全文走査                                                                                                                      |
| 3   | searchableText 生成 | `repository.ts:125,225` / `memo-bridge.ts:131` | `stripHtml`(DOMParser) / `stripTagsForSearch`(`/<[^>]*>/g`) で **HTML からテキスト抽出**                                                                                                  |
| 4   | MCP 検索            | `mcp/tools/search-memos.tool.ts:46`            | `Array.from(memo.content)` で excerpt 生成（文字列前提）                                                                                                                                  |

### 2.4 オフライン（IndexedDB）

| 資産        | パス                        | 現状                                                                                                                                                                                                               |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DB スキーマ | `utils/offline/db.ts`       | `OFFLINE_DB_VERSION = 1`。`CachedMemoRecord.content: string` / `searchableText: string` / `PendingOperationPatch.content?: string`。`upgrade` は破壊再構築フォールバックあり（`openOfflineDb` が wipe→再取得可能） |
| ブリッジ    | `utils/memo/memo-bridge.ts` | `memoToSnapshot`/`cachedToMemo` が content を string 中継。offline patch の `content` も string                                                                                                                    |

### 2.5 プレビュー生成（⚠ 文字列前提が 2 箇所）

| 箇所           | パス:行                                         | 現状                                                                                        |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ダッシュボード | `backend/src/dashboard/dashboard.service.ts:49` | `contentPreview: m.content.slice(0,100)`。JSON 化で `.slice` が型エラー＋プレビューが壊れる |
| MCP excerpt    | `backend/src/mcp/tools/search-memos.tool.ts:46` | `Array.from(memo.content ?? '')` で先頭抽出                                                 |

---

## 3. Requirement-to-Asset Map（ギャップ付き）

タグ: **[拡張]**=既存改修 / **[新規]**=新規作成 / **[制約]**=既存アーキ由来の制約 / **[研究]**=design で要調査

| 要件                          | 関連既存資産                                                                       | 必要対応                                                                                                                                                                       | ギャップタグ       |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| **R1** スキーマ JSONB 化      | `schema.prisma`（`Theme.styles` が Json 前例）                                     | `content` を `Json`/`Json?` へ。in-place 変換は HTML が非 JSON のため不可 → 退避列 + アプリ変換 + ロールバック down                                                            | [拡張][制約][研究] |
| **R2** ロスレス HTML→JSON     | `createEditorExtensions.ts` / `@tiptap/core`                                       | `generateJSON(html, 同一拡張)` で変換。idempotent・空 doc・NULL 維持・解釈不能行のエラー記録。**backend に TipTap 依存なし**                                                   | [新規][制約][研究] |
| **R3** エディタ JSON 入出力   | `RichTextEditor.tsx` / `contentSync.ts`                                            | `getHTML→getJSON`、`setContent(json, {emitUpdate:false})`、自己エコー ref を JSON 化、**構造的等価判定**へ、空 doc 初期値、ラウンドトリップ                                    | [拡張][研究]       |
| **R4** DTO/API の JSON 対応   | 4 DTO / `memo.service` / `notebook.service`                                        | `@IsString`→JSON(doc 形) 検証、Prisma `InputJsonValue`、取得は JSON で返す。last-write-wins 維持（型非依存で容易）                                                             | [拡張][新規]       |
| **R5** 公開ビュー JSON 描画   | `PublicMemoRenderer.tsx`（生 HTML 不使用＝**ほぼ達成済**）/ `memo-sharing.service` | `content` 型を JSONContent へ、`PublicMemoView`/DTO 型変更、rel 属性は既存ファクトリ継承                                                                                       | [拡張]             |
| **R6** 本文検索の継続         | `memo.service.search`(contains) / offline `repository` / `memo-bridge` / MCP tool  | **JSON→可読テキスト抽出**を全層へ。DB 検索方式の選定（キー名誤ヒット回避）                                                                                                     | [新規][制約][研究] |
| **R7** 段階移行・ロールバック | （新規）migration / 検証スクリプト                                                 | 件数・本文突合、dry-run、中断時ロールバック、（任意）デュアルリード                                                                                                            | [新規][研究]       |
| **R8** 非回帰・制約遵守       | `useAutoSave`(容易) / `dashboard.service` / MCP excerpt / IndexedDB / 既存テスト群 | プレビュー 2 箇所の JSON 化、IndexedDB スキーマ移行、`contentSync`/`saveRoundTrip`/`PublicMemoRenderer`/公開不変条件テストの JSON 追従。**実行時バンドルに外部 JS を足さない** | [拡張][制約]       |

---

## 4. 主要技術ギャップ詳細

### 4.1 スキーマ移行は SQL 単独では完結しない（R1×R2×R7 の結節点）

既存 `content` は HTML 文字列で有効な JSON ではないため、`ALTER COLUMN content TYPE jsonb USING content::jsonb` は失敗する。HTML→ProseMirror JSON は **TipTap スキーマを使うアプリ層変換が不可避**。よって最低限の手順は「①退避列に旧 HTML を保持 → ②アプリ/スクリプトで変換し JSON を書き込み → ③検証 → ④`content` を JSONB 化（または変換済み列を入れ替え）→ ⑤旧 HTML を一定期間ロールバック用に保持」。
Req1.3「データ破棄の drop→add をしない」は**退避列方式と矛盾しない**（データロスする操作のみ禁止）。ただし「同一 content カラムを USING で変換」という文面との手順整合は design/validate-design で明文化が必要。

### 4.2 変換ロジックの実行場所（最重要・モノレポ境界問題）

Req2.2 は「`createEditorExtensions` と同一ノード定義での変換」を要求するが、ファクトリは **frontend パッケージ**にあり、**backend に TipTap/ProseMirror 依存はゼロ**。さらに `generateJSON` は実行時に DOM を要する。DB I/O（Prisma）は backend 側。この 3 つ（拡張定義 / DOM / Prisma）の所在が分かれているのが核心。→ §7 研究項目。

### 4.3 本文テキスト抽出の共通化（R6 / R8 プレビュー）

content が JSON になると、検索 4 箇所＋プレビュー 2 箇所の「文字列 slice / HTML strip」がすべて破綻する。**ProseMirror JSON → 可読プレーンテキスト抽出**の単一ロジックが必要（text ノードの値のみ連結し、`type`/`paragraph` 等のキー名を拾わない＝Req6.3）。フロントは既存 `searchableText` パターンに自然に乗る。backend は DB 検索用にこの抽出結果を**生成列/通常列で保持**する選択肢が有力（§5）。

### 4.4 contentSync の JSON 等価判定（R3.4）

現状は HTML 文字列の完全一致で自己エコー / 外部変更を分離。JSON 化では `lastEmitted`/`currentHtml` を JSONContent にし、**構造的等価**（deep equal）へ変更が必要。`JSON.stringify` 比較はキー順序依存のため、ProseMirror 出力のキー順安定性は要検証（§7）。input rule 巻き戻し・保存ループ防止の不変条件は維持する。

### 4.5 IndexedDB スキーマ移行（R8）

`CachedMemoRecord.content` / `PendingOperationPatch.content` の型が string→JSON へ。`OFFLINE_DB_VERSION` 引き上げが必要。キャッシュはサーバーから再取得可能のため**全 wipe 再構築でもデータロスにはならない**が、`pending_operations`（未送信編集）に JSON content が乗る点と、`searchableText` 再生成ロジックの JSON 対応が論点。

### 4.6 デュアルリード要否（R7.4）

TipTap 描画は HTML/JSON 双方を受理するため**フロント描画はデュアルリード耐性が高い**。ビッグバン変換（移行ウィンドウ内で全件変換）を選べばデュアルリードは不要にできる。段階移行を選ぶ場合のみ backend 取得時の型過渡期設計が要る。→ design で「ビッグバン vs 段階」を選択。

---

## 5. 実装アプローチ Options

### Option A: 既存資産を最小拡張（ビッグバン変換）

- 既存ファイルを型・呼び出しレベルで改修。移行は単一スクリプトで全件変換しデュアルリードを設けない。
- ✅ 変更が局所的・既存パターン踏襲・過渡期コードが残らない
- ✅ デュアルリード分岐が無く読み取り側がシンプル
- ❌ 変換失敗時の影響が一度に出るため検証・ロールバック設計の品質に全依存
- ❌ §4.2 の「変換実行場所」を解決しないと成立しない
- **適性**: データ件数が移行ウィンドウ内で安全に処理でき、検証が十分なら最有力。

### Option B: 検索/抽出を新規モジュールに切り出し

- `prosemirror-text`（JSON→テキスト抽出）と JSON content バリデータを新規ユーティリティ化し、検索 4 層・プレビュー 2 層・DTO 検証が共通利用。
- ✅ 文字列前提の分散を 1 つの真実源へ集約・テスト容易
- ✅ DB 検索用テキスト列の生成も同ロジックで一貫
- ❌ frontend/backend で同ロジックをどう共有するか（重複 or 共有パッケージ）が新たな設計判断
- **適性**: R6/R8 の分散解消には事実上必須。A/C と併用する部品。

### Option C: 段階ハイブリッド（推奨）

- **スキーマ**: 退避列（`content_html` 等）で旧データ保持 + 変換 + JSONB 化 + down マイグレーション（R1/R7）。
- **変換**: 単一情報源を `createEditorExtensions` に固定。実行場所は研究で確定（§7-1）。dry-run・件数/サンプル突合・解釈不能行のエラー記録・idempotent を備える。
- **検索/抽出**: Option B のユーティリティを採用。DB は検索用テキスト列（生成列 or 書き込み時更新）を追加し、`contains` をそこへ向ける（検索刷新＝非スコープは侵さない）。
- **描画/エディタ**: `RichTextEditor`/`contentSync`/`PublicMemoRenderer` を JSON 化、型を JSONContent へ。
- ✅ ロールバック確保とデータロスゼロを構造で担保
- ✅ 各層の責務を分離しつつ既存パターンを尊重
- ❌ 計画が最も重く、移行スクリプトと検証の作り込みコストが大きい
- **適性**: Req7 のデータロスゼロ・ロールバック要件を最優先するなら本構成が要件適合度が最も高い。

---

## 6. Effort & Risk（領域別）

| 領域                                  | 要件       | Effort    | Risk       | 一言根拠                                                        |
| ------------------------------------- | ---------- | --------- | ---------- | --------------------------------------------------------------- |
| スキーマ + データ移行スクリプト       | R1, R2, R7 | **L〜XL** | **High**   | SQL 単独不可・変換正確性・ロールバック・件数突合が全て揃う必要  |
| 変換ロジック共有（モノレポ境界）      | R2, R6, R8 | **M〜L**  | **High**   | backend に TipTap 依存なし＋実行時バンドル制約の両立が未知      |
| frontend エディタ入出力               | R3         | **M**     | **Medium** | 自己エコー/等価判定の JSON 化、ラウンドトリップ担保             |
| 公開描画                              | R5         | **S**     | **Low**    | 生 HTML 不使用で土台達成済、型変更が中心                        |
| backend DTO/API                       | R4         | **S〜M**  | **Medium** | JSON(doc 形) バリデータ新規、Prisma Json 型整合                 |
| 本文検索の継続                        | R6         | **M**     | **Medium** | 4 層のテキスト抽出統一 + DB 検索方式選定（誤ヒット回避）        |
| 非回帰（プレビュー/IndexedDB/テスト） | R8         | **M**     | **Medium** | プレビュー 2 箇所・IDB バージョン移行・既存テスト群の JSON 追従 |
| **総合**                              | R1–R8      | **L〜XL** | **High**   | データロスゼロ制約が全体リスクを牽引                            |

---

## 7. Research Needed（design へ持ち越す研究項目）

1. **変換ロジックの実行場所**（最優先）: 候補 = (i) frontend 内移行ツール（`createEditorExtensions` を直 import、happy-dom/jsdom で `generateJSON`、DB は二段[HTML export→変換→JSON import]）/ (ii) backend スクリプトがノード定義を取り込み（複製 or 共有パッケージ `packages/editor-schema` 新設）/ (iii) 共有パッケージ化。Req8.1「実行時バンドルに足さない」を満たしつつ Req2.2「ファクトリ一致」を担保する解を選ぶ。
2. **JSONB 検索方式**（R6）: 検索用テキスト列（生成列 `GENERATED` か書き込み時更新か）/ `jsonb` テキスト抽出関数 + ILIKE のいずれか。text ノード値のみ対象にしキー名・ノードタイプ名の誤ヒットを避ける方式。既存 `/memos/search(/paginated)` 契約は不変。
3. **スキーマ移行手順の確定**: 退避列方式 vs 変換済み新列 rename vs ALTER USING（変換値前提）。Req1.3 文面との整合と down マイグレーション設計。
4. **JSON 等価判定の安定性**（R3.4）: ProseMirror `getJSON()` 出力のキー順安定性、deep equal の実装（自前 / 既存 util）。`JSON.stringify` 比較の可否。
5. **移行の単位とスケール**: 全件件数・バッチサイズ・トランザクション境界・所要時間（ビッグバン可否＝デュアルリード要否の判断材料）。Supabase（pooling 6543 / direct 5432）での実行経路。
6. **IndexedDB 移行**: バージョン引き上げ + 全 wipe 再取得 vs 値マイグレーション。`pending_operations` に残る未送信 JSON content の扱い。
7. **空・不正・解釈不能データの扱い**: 空相当 HTML→空 doc（R2.4）、Notebook NULL 維持（R2.5）、解釈不能行のエラー記録継続（R2.6）、API 不正 JSON の 400（R4.4）の具体仕様。

---

## 8. design への推奨

- **推奨アプローチ**: **Option C（段階ハイブリッド）+ Option B のユーティリティ切り出し**。データロスゼロ・ロールバック（Req7）を構造で担保しつつ、文字列前提の分散（検索 4 / プレビュー 2）を単一抽出ロジックへ集約する。
- **design で最初に確定すべき 2 大決定**:
  1. **変換ロジックの実行場所**（§7-1）— これが移行スクリプト・共有方式・バンドル制約の全てを規定する起点。
  2. **JSONB 検索方式 + 検索用テキスト列の有無**（§7-2）— Req6 と Req8 の非回帰範囲を規定。
- **早期に潰すべき不確実性**: `generateJSON` を既存拡張で流したときの HTML↔JSON ラウンドトリップ忠実度（task/code/link/見出し/装飾）。`saveRoundTrip.test.ts` の不変条件を JSON 版へ翻訳し、変換忠実度の検証土台を design 段階で確保することを推奨。
- **崩してはならない既存不変条件**: 公開ビューの生 HTML 不使用（Req5.3 = 現状維持）、自動保存の 5 状態/2 秒（Req8.2）、last-write-wins（Req4.5）、`.memo-content` テーマ適用（Req8.4）、所有権チェック一元化、`apiClient` 経由・React Query 単一真実源。

---

## 9. 確定した設計方針（2026-07-02 ユーザー決定）

design の二大決定（§7-1 / §7-2）を以下で確定する。

### 決定1: 変換ロジックは「frontで変換・back非依存」

- **HTML→JSON**（`generateJSON`）は **frontend 側の一度きり移行スクリプト**で `createEditorExtensions` ＋ jsdom（既存 vitest 環境と同一の DOM 実装）を用いて実行し、Req2.2 の拡張定義一致を担保する。
- **JSON→プレーンテキスト抽出**（検索列・プレビュー・excerpt 用）は **TipTap/DOM に非依存の純関数**（ProseMirror JSON を再帰走査し `text` を連結）として各層に配置し、**backend に TipTap/ProseMirror 依存を追加しない**（Req8.1 を自然遵守）。
- **共有パッケージ（`packages/editor-schema`）は新設しない**。initial cost を回避する。
- **背景**: 「変換」は①スキーマ＋DOM 必須だが一度きりの HTML→JSON と、②スキーマ不要で恒久的な JSON→text の 2 種に分解できる。①を frontend、②を純関数化することで backend 非依存を維持できる。

### 決定2: 検索は「検索用テキスト列を維持」

- DB に**検索用プレーンテキスト列**（例: `contentText`）を追加し、`create` / `update` / 移行スクリプトで JSON→text を書き込む。`memo.service` の `contains` をこの列へ向ける。
- 既存 offline の `searchableText` と**対称**の設計で、Prisma で素直に表現でき、`/memos/search(/paginated)` の入出力契約（Req6.4）を維持する。検索刷新（tsvector 化＝非スコープ）は行わない。
- **注意点**: 書き込み経路（create / update / 移行 / offline sync）での**更新漏れを防ぐ**単一の抽出ユーティリティ利用を design で担保する。

### design で引き続き詰める細部（決定1・2から派生）

- 移行スクリプトの DB I/O 方式: 2 段パイプライン（backend で HTML export → frontend で変換 → backend で JSON import）か、frontend から Prisma を dev 一時利用の直結か。
- 検索用テキスト列の仕様: カラム名・NULL 可否・インデックス要否・Notebook 側の要否。
- JSON→text 純関数の配置と重複許容範囲（backend `common` util / frontend `utils`、最小共有の是非）。
- `contentSync` の JSON 構造的等価判定の実装（deep equal / キー順安定性の検証）。
- IndexedDB スキーマ移行方式（`OFFLINE_DB_VERSION` 引き上げ + wipe 再取得 vs 値マイグレーション、`pending_operations` の JSON content 扱い）。
- スキーマ移行手順（退避列 + 変換 + JSONB 化 + down）と Req1.3 文面との整合明文化。

### 次フェーズ

- 本ギャップ分析（§9 の確定方針含む）を踏まえ、`/kiro:spec-design content-jsonb-migration` で技術設計へ進む。
- requirements を確定とみなして直接進める場合は `/kiro:spec-design content-jsonb-migration -y`。

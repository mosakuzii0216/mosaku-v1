# Research & Design Decisions — content-jsonb-migration

---

**Purpose**: design.md を支える discovery 結果・技術調査・意思決定の根拠を記録する。design.md は自己完結を保ち、本書は背景と一次情報の置き場とする。

---

## Summary

- **Feature**: `content-jsonb-migration`
- **Discovery Scope**: Complex Integration（既存フルスタック拡張 + データ移行）。gap-analysis.md で light discovery 相当は完了済み、本書は design を確定させる技術裏取りに集中。
- **Key Findings**:
  - 「変換」は 2 種に分解できる。①**一度きり**の HTML→ProseMirror JSON（スキーマ + DOM 必須）と、②**恒久**の JSON→可読テキスト（スキーマ不要の純走査）。①を frontend + jsdom、②を TipTap 非依存の純関数にすることで、Req2.2（拡張一致）と Req8.1（backend に TipTap を足さない）を同時に満たせる（= gap-analysis §9 決定1 を技術的に裏付け）。
  - スキーマ移行は SQL 単独で不可能。**expand → 変換 → verify → cutover（in-place `ALTER COLUMN ... TYPE JSONB USING`）→ 収縮**の段階手順で、退避列 `contentHtml` を残せば down マイグレーションで原本 HTML を完全復元でき Req1.3/1.4/7 を満たす。
  - 検索は **検索用プレーンテキスト列 `contentText`** を追加し `contains` をそこへ向ける（gap-analysis §9 決定2）。既存 offline `searchableText` と対称で、Req6.3（キー名誤ヒット回避）と Req6.4（契約維持）を両立。
  - データ規模が招待制で小さく、TipTap 描画が HTML/JSON 双方を受理するため、**ビッグバン移行（デュアルリード無し）**が実行可能。Req7.4 は「Where デュアルリードを採用する場合」の条件節のため、非採用で無矛盾に充足。

## Research Log

### TipTap v3 のサーバーサイド HTML→JSON 変換手段

- **Context**: Req2.2 は `createEditorExtensions` と同一ノード定義での変換を要求。変換ロジックの実行環境（DOM の有無・パッケージ）を確定する必要がある。frontend は TipTap v3.22.2 + jsdom ^29（vitest `environment: 'jsdom'`）を保有、backend は TipTap 依存ゼロ（確認済み）。
- **Sources Consulted**:
  - [HTML utility | Tiptap Editor Docs](https://tiptap.dev/docs/editor/api/utilities/html)
  - [generateJSON imported from @tiptap/html/server does not work on the server · Issue #6939](https://github.com/ueberdosis/tiptap/issues/6939)
  - [generateJSON from @tiptap/html fails under node:test · Issue #6951](https://github.com/ueberdosis/tiptap/issues/6951)
- **Findings**:
  - `generateJSON(html, extensions)` は `@tiptap/html`（サーバー/ブラウザ両対応、仮想 DOM 前提）または `@tiptap/core`（ブラウザ限定）から取得できる。
  - Node 純環境向けの `@tiptap/html/server` エントリは v3 系で「Node environment 判定」に絡む既知不具合（#6939 / #6951）があり、jsdom/node:test でハマる報告が複数。
  - frontend には既に `jsdom` があり、vitest 実行時は `document` グローバルが存在する。この環境で `@tiptap/html` のブラウザ経路 `generateJSON` を回すのが最も安定。
- **Implications**: 移行変換は **frontend パッケージ内の一度きりスクリプトを既存 jsdom 環境で実行**し、`@tiptap/html` を **devDependency のみ**として追加する（実行時バンドル不変 = Req8.1 遵守）。`@tiptap/html/server` の Node 直実行は不採用（既知不具合の回避）。`createEditorExtensions` を直 import して拡張一致（Req2.2）を担保する。

### PostgreSQL の String→JSONB in-place 変換と Req1.3 の整合

- **Context**: Req1.1/1.2 は `content` を JSONB へ。Req1.3 は「既存行の content を保持したまま型変換し、データを破棄する drop→add を行わない」。既存 `content` は HTML 文字列で有効 JSON ではないため素の `USING content::jsonb` は失敗する。
- **Findings**:
  - `ALTER TABLE ... ALTER COLUMN col TYPE jsonb USING <expr>` の `<expr>` は**同一行の他カラムを参照可能**。よって事前に別カラム（`contentJson` staging）へ変換済み JSON を書き込み、`USING contentJson` で in-place 変換すれば、`content` カラムの identity を保ったまま（drop→add せず）型だけ JSONB 化できる。
  - 退避列 `contentHtml`（原本 HTML の複製）を残せば、down マイグレーションは `ALTER COLUMN content TYPE text USING contentHtml` で原本を完全復元でき、Req1.4/7.2/7.3 を満たす。
- **Implications**: 「expand（列追加）→ 変換（staging 充填）→ verify → cutover（in-place `TYPE jsonb USING contentJson` + `SET NOT NULL`）→ staging 破棄」を採用。`content` カラムは一貫して in-place ALTER のみで drop→add しない → Req1.3 文面と整合。退避列は rollback ウィンドウ経過後に別マイグレーションで撤去。

### JSON→可読テキスト抽出方式（検索の継続 / Req6・Req8 プレビュー）

- **Context**: content が JSON 化すると検索 4 層（DB `contains` / offline `repository` / `memo-bridge` / MCP）とプレビュー 2 層（dashboard / MCP excerpt）の文字列 slice / HTML strip が全て破綻。Req6.3 は「JSON のキー名・ノードタイプ名（`type` / `paragraph` 等）を検索語に誤ヒットさせない」。
- **Findings**:
  - ProseMirror JSON を再帰走査し `text` ノードの値のみを連結（ブロック境界で空白挿入）すれば、構造キーを一切含まないプレーンテキストが得られる。DOM/TipTap 不要の純関数で実装可能。
  - DB 側は同抽出結果を専用列 `contentText` に保持し `contains` を向ける方式が、既存 offline `searchableText`（`stripHtml` 相当）と対称で、Prisma でも素直。Req6.4（`/memos/search(/paginated)` の入出力契約）は where 句の対象列を替えるだけで維持。
- **Implications**: gap-analysis §9 決定2 を採用。抽出純関数は backend `common` と frontend `utils` に**各層配置（共有パッケージ新設せず）**。両実装のドリフト防止に**共通ゴールデンテストベクタ**で出力一致を検証する。`contentText` は書き込み経路（create / update / 移行 / offline sync）で必ず同一ユーティリティ経由で更新し、更新漏れを防ぐ。

### エディタ content 同期の JSON 構造的等価判定（Req3.4）

- **Context**: 現状 `contentSync.ts` は HTML 文字列の 3 値完全一致で自己エコー / 外部変更を分離。JSON 化で文字列一致は使えず、構造的等価へ変更が必要。`JSON.stringify` 比較は ProseMirror 出力のキー順に依存し脆い。
- **Findings**:
  - `decideContentSync` は純関数で、入力を JSONContent 化し比較関数を注入すれば同アルゴリズム（echo 優先 → 等価 → apply）を保てる。
  - 自己エコー判定は「実際に emit した JSON 参照」との**参照/深い等価**で行えば、キー順揺れの影響を受けない（emit 値をそのまま保持するため）。外部変更判定にのみ deep-equal が要る。
  - 等価は**キー順非依存の deep-equal**（オブジェクトはキー集合で比較）を自前実装（小関数）し、`JSON.stringify` 比較は不採用。
- **Implications**: `contentSync` を `JSONContent` ジェネリックに変更し deep-equal コンパレータを注入。input rule 巻き戻し（Req3.3）と保存ループ防止（Req3 / Req8.2）の不変条件は現行のまま維持。ラウンドトリップ一致（Req3.6）はテスト不変条件として JSON 版へ翻訳。

### ビッグバン移行 vs デュアルリード（Req7.4）

- **Context**: 段階移行でデュアルリード（文字列/JSON 両読み）を設けるか、移行ウィンドウ内で全件変換するか。
- **Findings**:
  - TipTap `useEditor({ content })` は HTML/JSON 双方を受理 → フロント描画はデュアルリード耐性が高く、万一の未変換行も描画は壊れにくい（安全網）。
  - 招待制アプリで対象行数は小さく、maintenance window 内の全件変換が現実的。デュアルリードは backend 取得型の過渡期 union を生み、DTO/型/検索の複雑性を増やす。
- **Implications**: **ビッグバン（デュアルリード非採用）**を選択。読み取り側の型は移行後 JSON 単一で単純化。Req7.4 は条件節（Where 採用時）のため非採用で無矛盾。cutover は verify 通過を gate に単一トランザクション。

### IndexedDB v1→v2 移行と未送信オフライン編集

- **Context**: `CachedMemoRecord.content` / `PendingOperationPatch.content` の型が string→JSON。`OFFLINE_DB_VERSION` 引き上げが必要。`openOfflineDb` は破壊再構築フォールバックを持つ（server から再取得可能）。
- **Findings**:
  - `memos` ストアは server 再取得可能なため wipe→再構築でデータロスにならない。
  - `pending_operations`（未送信編集）に**旧形式 HTML content** が残ると、更新後クライアントが JSON 期待 API へ HTML を送り 400 になる過渡期エッジがある。offline 中は jsdom が無く HTML→JSON 変換もできない。
- **Implications**: `OFFLINE_DB_VERSION` を 2 へ。`memos` は wipe 再構築を許容。未送信 pending は「デプロイ前に drain（オンライン同期）」を運用手順とし、残存した旧形式 pending は破棄扱い（server の既存メモは無傷 = Req7 のデータロスゼロ対象は server 本文）。この過渡期エッジは design の Open Questions/Risks に明記。

## Architecture Pattern Evaluation

gap-analysis §5 の 3 案を design 向けに再評価（§9 でユーザーが方向性を確定済み）。

| Option                                | 概要                                                             | 強み                                           | リスク / 限界                                       | 採否                                             |
| ------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| A: 既存最小拡張（ビッグバン変換のみ） | 既存ファイルを型・呼び出しレベルで改修、単一スクリプト全件変換   | 変更が局所・過渡期コード無し                   | §4.2 変換実行場所を解かないと不成立・検索分散が残る | 部分採用（ビッグバン戦略のみ流用）               |
| B: 抽出/検証を新規モジュール化        | JSON→text 抽出と JSON バリデータを純ユーティリティ化し全層で共用 | 文字列前提の分散を単一真実源へ集約・テスト容易 | front/back の共有方式判断が別途必要                 | **採用**（純関数を各層配置・共有パッケージ無し） |
| C: 段階ハイブリッド                   | 退避列 + 変換 + JSONB 化 + down、検索列、描画/エディタ JSON 化   | ロールバックとデータロスゼロを構造で担保       | 計画が最も重い・移行スクリプト作り込み大            | **採用**（全体骨格）                             |

**結論**: **C（全体骨格）+ B（抽出ユーティリティ）**。C の「退避列 + in-place ALTER」で Req1/Req7 を担保しつつ、B の純関数で検索/プレビューの文字列前提分散を単一化する。A からはビッグバン移行戦略のみ流用（デュアルリード非採用）。

## Design Decisions

### Decision: 変換ロジックの二分割と実行場所（gap-analysis §9 決定1 の技術確定）

- **Context**: Req2.2（拡張一致）と Req8.1（backend に TipTap 追加禁止）が緊張。変換は DOM/スキーマ必須。
- **Alternatives Considered**:
  1. backend スクリプトへノード定義を複製 or `@tiptap/html/server` を Node 実行 — #6939/#6951 の既知不具合 + backend に TipTap 依存混入。
  2. 共有パッケージ `packages/editor-schema` 新設 — initial cost 大、モノレポ構成変更。
  3. frontend の一度きりスクリプト（jsdom + `createEditorExtensions`）で HTML→JSON、JSON→text は TipTap 非依存の純関数で各層配置。
- **Selected Approach**: 3。①HTML→JSON は frontend + 既存 jsdom + `@tiptap/html`（devDependency）、②JSON→text は純関数を backend/frontend に各配置。
- **Rationale**: ①は一度きりなので devDep で十分（実行時バンドル不変）、②はスキーマ不要のため backend 非依存を自然遵守。共有パッケージの initial cost も回避。
- **Trade-offs**: ②の純関数が 2 実装に分かれ出力ドリフトの余地 → ゴールデンテストベクタで担保。
- **Follow-up**: `@tiptap/html` の import 経路（ブラウザ経路 vs `/server`）を実装時に jsdom 上で確定。

### Decision: スキーマ移行手順（expand-migrate-contract + in-place ALTER USING）

- **Context**: HTML は非 JSON のため素の in-place cast 不可。Req1.3 は drop→add 禁止 + 同一 content 列の USING 変換を示唆。
- **Selected Approach**: (A) expand: `contentJson JSONB NULL` + `contentText TEXT NULL` +（cutover 時）退避列 `contentHtml TEXT`。(B) 変換スクリプトで `contentJson`/`contentText` 充填。(C) verify。(D) cutover: `contentHtml := content` 退避 → `ALTER COLUMN content TYPE jsonb USING contentJson` → Memo は `SET NOT NULL` → `DROP COLUMN contentJson`。(E) 収縮: rollback ウィンドウ経過後に `contentHtml` 撤去（別マイグレーション）。
- **Rationale**: `content` を一貫して in-place ALTER のみで扱い drop→add しない（Req1.3）。退避列で原本 HTML を完全復元でき down 可能（Req1.4/7）。
- **Trade-offs**: 列が一時的に増える / 手順が多段。→ 検証チェックポイントとロールバックトリガを明文化して相殺。
- **Follow-up**: cutover の単一トランザクション化と Supabase（direct 5432）実行経路。Notebook は `SET NOT NULL` しない（NULL 許容維持 = Req1.2/2.5）。

### Decision: 移行スクリプトの DB I/O（2 段ファイルパイプライン）

- **Context**: 変換は frontend（jsdom + 拡張）、DB I/O は backend（Prisma）。所在が分かれる。
- **Alternatives Considered**:
  1. frontend から Prisma/pg を dev 直結 — frontend に DB 依存混入。
  2. backend export → frontend 変換 → backend import の 3 ステージ（中間 NDJSON ファイル）。
- **Selected Approach**: 2。Stage1 backend が `{id, content}` を NDJSON export。Stage2 frontend が jsdom + `createEditorExtensions` で変換し `{id, contentJson, contentText, error?}` を出力（行単位エラー記録 = Req2.6、空→空 doc = Req2.4、Notebook NULL 維持 = Req2.5）。Stage3 backend が id 突合で `contentJson`/`contentText` を Prisma 書き戻し（冪等 = Req2.7）。
- **Rationale**: モノレポ境界を尊重（front 変換 / back DB）。Stage2 で停止すれば dry-run（書込なし = Req7.5）。id キーで再実行安全（冪等）。
- **Trade-offs**: 中間ファイル管理。→ 一度きり運用のため許容。
- **Follow-up**: バッチサイズ・件数突合レポート様式（Req7.1）。

### Decision: 検索用テキスト列 contentText の維持（gap-analysis §9 決定2）

- **Context**: JSONB `contains` は不可・`content::text` はキー名誤ヒット（Req6.3 違反）。
- **Selected Approach**: `contentText TEXT` を追加し、create/update/移行/offline sync の全書込経路で JSON→text 純関数の出力を保存。`memo.service` の `contains` を `contentText` へ向ける。
- **Rationale**: 既存 `searchableText` と対称・Prisma で素直・`/memos/search(/paginated)` 契約維持（Req6.4）。検索刷新（tsvector）は非スコープを侵さない。
- **Trade-offs**: 書込経路での更新漏れリスク → 単一ユーティリティ経由を強制、テストで担保。
- **Follow-up**: `contentText` の NULL 可否（空 doc→空文字）・インデックス要否・Notebook 側検索要否（現状 Notebook 本文検索は未提供のため Notebook は `contentText` 任意）。

## Risks & Mitigations

- **変換忠実度不足（Req2.3）** — task/code/link/見出し/装飾の HTML↔JSON ラウンドトリップで情報欠落 → `saveRoundTrip.test.ts` の不変条件を JSON 版へ翻訳し、代表構造のゴールデンフィクスチャで変換前後を機械比較。early に潰す。
- **cutover 中断でのデータロス** — 変換途中失敗 → `content`（HTML 原本）は cutover まで無改変、`contentHtml` 退避 + down マイグレーションで復元。verify 通過を cutover の gate に。
- **JSON→text 純関数の front/back ドリフト** — 検索結果が層で不一致 → 共通ゴールデンテストベクタで両実装の出力一致を CI 検証。
- **未送信オフライン編集の過渡期喪失** — IDB v1→v2 で旧 HTML pending が JSON API に 400 → デプロイ前 drain を運用手順化、残存 pending は破棄（server 本文は無傷）。
- **backend の JSON 構造検証限界** — backend に TipTap schema が無く完全な node/mark 妥当性検証は不可 → DTO は `type:'doc'` + ノード浅構造の shape 検証に留め（Req4.4 の 400 は満たす）、完全性はエディタ側が保証する境界を design に明記。
- **ProseMirror キー順非決定性（Req3.4）** — `JSON.stringify` 等価が偽陰性 → キー順非依存 deep-equal を採用、stringify 比較禁止。

## References

- [HTML utility | Tiptap Editor Docs](https://tiptap.dev/docs/editor/api/utilities/html) — `generateJSON` / `generateHTML` のパッケージと DOM 要件
- [Export to JSON and HTML | Tiptap Editor Docs](https://tiptap.dev/docs/guides/output-json-html) — getJSON/getHTML と往復
- [Issue #6939 — @tiptap/html/server does not work on the server](https://github.com/ueberdosis/tiptap/issues/6939) — Node 直実行の既知不具合
- [Issue #6951 — generateJSON fails under node:test](https://github.com/ueberdosis/tiptap/issues/6951) — jsdom/node 環境の注意
- gap-analysis.md（本 spec 内） — 現状資産マップ・§9 確定方針

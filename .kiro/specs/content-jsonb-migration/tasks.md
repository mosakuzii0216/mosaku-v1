# Implementation Plan

> 本文（`content`）を HTML 文字列 → ProseMirror/TipTap 構造化 JSON（PostgreSQL JSONB）へ移行する、データ移行を伴うフルスタックのフォーマット変更。最優先制約は **既存本文のデータロスゼロ・ロールバック可能**。
>
> **並列実行の全体像**: Task 1（共有基盤）と Task 2（スキーマ）は別サブシステムのため並行可。両者完了後、Task 3（backend）/ Task 4（frontend）/ Task 5（移行パイプライン）は別境界のため 3 ストリーム並行可。Task 6（統合・非回帰）は 3・4・5 完了後。各メジャー内サブタスクは同一ファイルを触り得るため記載順に実施する。

- [x] 1. 共有 ProseMirror 基盤（型・検証・テキスト抽出）
- [x] 1.1 ProseMirror 型・述語・DTO 検証デコレータ（backend 共通）
  - `ProseMirrorDoc` / ノード / マーク型を `any` 不使用で定義し、全層で共有できる型安全表現にする
  - `type: 'doc'` とノードの浅い shape（各要素が `type: string` を持つ）を検証する純粋述語を実装する（TipTap の完全 schema 検証は要求しない）
  - 空 doc 判定・空 doc 生成（`{ type:'doc', content:[{ type:'paragraph' }] }`）のヘルパを実装する
  - `class-validator` カスタムデコレータを実装し、非オブジェクト・`type!=='doc'` を無効、空 doc を許可、Notebook 向けに `null` 許容の分岐を持たせる
  - _Requirements: 1.5, 3.5, 4.1, 4.4_

- [x] 1.2 extractPlainText 純関数（frontend/backend 同一仕様）とゴールデンベクタ
  - JSON を再帰走査し text ノード値のみ連結、ブロック境界に単一空白を挿入し語の融合を防ぐ純関数を実装する
  - 構造キー名・ノードタイプ名・attrs を出力に一切含めず、`null`/空 doc は空文字、同一入力で決定的な出力にする
  - DOM/TipTap 非依存で backend 共通ユーティリティと frontend ユーティリティに各配置する（共有パッケージは新設しない）
  - 移行フォールバックとエディタ初期値で共用する frontend 側の空 doc 生成ヘルパ（`JSONContent`）を用意する
  - 見出し/リスト/チェック/コード/引用/リンク/装飾を混在させた共通ゴールデンベクタで front/back 出力の一致をテストする
  - _Requirements: 6.2, 6.3, 8.1_

- [x] 2. (P) Prisma スキーマと段階マイグレーション（expand-migrate-contract） — Task 1 と並行可（Prisma/SQL の別サブシステム）
- [x] 2.1 expand マイグレーション（additive な staging / 退避列の追加）
  - `memos` / `notebooks` に staging 列 `contentJson`(JSONB NULL) と派生列 `contentText`(TEXT NULL)、退避列 `contentHtml`(TEXT NULL) を追加する
  - 既存 `content`(String) は無改変・additive のみとし、既存データを破壊しない
  - down は追加列の DROP のみとし、原状復帰可能にする
  - _Requirements: 1.3, 7.3_

- [x] 2.2 cutover マイグレーション（in-place 型変換と down 経路）
  - 単一トランザクションで `content` を `contentHtml` へ退避コピー → `ALTER COLUMN content TYPE jsonb USING contentJson` → Memo に `SET NOT NULL` → staging `contentJson` を DROP する
  - `content` は drop→add せず in-place 型変換のみで JSONB 化する
  - Notebook の `content` は NULL 許容を維持する
  - down は `ALTER COLUMN content TYPE text USING contentHtml` で原本 HTML を完全復元する経路にする
  - 前提: `contentJson` が全行充填済み（Task 5 の移行パイプライン適用後）。ローカルは空 DB reset 前提で適用する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.2, 7.3_

- [x] 2.3 contract マイグレーションと Prisma スキーマ最終化
  - rollback ウィンドウ後に退避列 `contentHtml` を撤去する contract マイグレーションを追加する
  - `schema.prisma` を最終形（`Memo.content Json` NOT NULL / `Notebook.content Json?` / 両者 `contentText String?`）へ更新し、Prisma Client を再生成する
  - 再生成後に `content` を `Json` 型として `any` を介さず型安全参照できることを確認する
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 3. (P) バックエンド API・DTO・サービスの JSON 対応 — Task 4・5 と並行可（backend 境界 / 前提: Task 1・2）
- [x] 3.1 (P) メモ・ノートブック DTO を ProseMirrorDoc 検証へ切替
  - メモの作成/更新 DTO の `content` を文字列前提の検証から ProseMirrorDoc shape 検証へ置換する
  - ノートブックの作成/更新 DTO の `content` を JSON または `null` として受理する
  - 有効な JSON オブジェクト（doc 形）でない入力を 400 で拒否し保存しない
  - _Requirements: 4.1, 4.2, 4.4_

- [x] 3.2 書込経路で content(JSONB) と contentText を原子的に永続化
  - create/update で `extractPlainText` を単一経路として `contentText` を生成し、`content`(JSONB) と同一書込で永続化する
  - Prisma へ JSON 入力値として書込み、取得 API は `content` を JSON 値のまま返す（文字列へ直列化しない）
  - `clientUpdatedAt` の last-write-wins 比較ロジックと 409 応答を変更せず維持する
  - 前提: 3.1（DTO 検証通過を前提とする書込）
  - _Requirements: 4.3, 4.5, 4.6, 6.1_

- [x] 3.3 本文検索を contentText へ切替
  - 本文検索の部分一致対象を `content` から `contentText` へ向け、タイトル OR 本文テキストの検索を維持する
  - JSON 構造のキー名・ノードタイプ名（`type` / `paragraph` 等）に検索語が誤ヒットしない方式にする
  - 検索エンドポイント（`/memos/search`・`/memos/search/paginated`）の入出力契約（`q`・タグ絞り込み・ページネーション）を維持する
  - 前提: `contentText` 列（Task 2.1）
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 3.4 (P) 公開共有・プレビュー・MCP excerpt を JSON / contentText 由来へ
  - 公開メモ取得サービスが `content` を JSON 値で返すよう応答型を変更する
  - ダッシュボードの最近のメモのプレビューを `contentText` の slice に切替え、プレビュー文字数契約を不変に保つ
  - MCP 検索ツールの excerpt を `contentText` の slice に切替え、最大文字数とスコープ検査を不変に保つ（TipTap を backend に追加しない）
  - _Requirements: 5.1, 8.1_

- [ ] 4. (P) フロントエンド エディタ・公開ビュー・オフラインの JSON 化 — Task 3・5 と並行可（frontend 境界 / 前提: Task 1）
- [ ] 4.1 (P) contentSync を JSON 構造的等価へ切替
  - 親 content・直近 emit した JSON・現在の editor JSON を比較し `skip-echo` / `skip-equal` / `apply` を判定するロジックを実装する
  - キー順非依存の deep-equal（`JSON.stringify` 比較を用いず、配列順は保持・オブジェクトはキー集合比較）を自前実装する
  - 自己エコー（直近 emit 参照）を外部変更より優先し、input rule の巻き戻しを起こさない不変条件を維持する
  - _Requirements: 3.3, 3.4_

- [ ] 4.2 RichTextEditor を getJSON 入出力へ切替
  - 更新時に `editor.getJSON()` を `onChange` で通知し、HTML 文字列を通知しないようにする
  - 直近 emit 参照を JSON 化し、外部変更時のみ `setContent` に JSON を渡して `emitUpdate` を抑止する
  - 新規メモは空 doc を初期値として扱い、`getJSON()`→保存→`setContent` の往復で内容が一致する
  - ツールバー・focus/blur の挙動を不変に保つ
  - 前提: 4.1（contentSync 判定）
  - _Requirements: 3.1, 3.2, 3.5, 3.6_

- [ ] 4.3 エディタホスト（MemoEditor / NotebookEditor）の content state を JSON 化
  - 本文 state を文字列から JSON へ変更し、空判定を文字列トリムから空 doc 判定へ置換する
  - onChange→setState→自動保存の流れと、自動保存の 5 状態インジケーター・編集停止 2 秒保存を不変に保つ
  - 前提: 4.2（JSON 入出力エディタ）
  - _Requirements: 3.2, 8.2_

- [ ] 4.4 (P) 公開ビュー（PublicMemoRenderer）の JSON 描画
  - 公開ビューの `content` を JSON として受け取り、編集側と同一の拡張ファクトリ（`editable:false`）へ渡して描画する
  - 生 HTML 直挿入（`dangerouslySetInnerHTML` 等）を用いず描画する現状を維持する
  - 本文面テーマスタイル（`.memo-content` / `prose`）とリンクのセキュリティ属性（`rel` / 危険スキーム排除）をファクトリ継承で不変に保つ
  - 公開ビューの content 型を JSON へ変更する
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 8.4_

- [ ] 4.5 (P) オフライン層 v2（IndexedDB スキーマと検索テキスト）
  - オフライン DB バージョンを 1→2 に上げ、キャッシュ本文と保留操作パッチの `content` を JSON 化する
  - 検索テキストを `extractPlainText` 由来で再生成し、HTML strip 実装を置換する
  - キャッシュは server 再取得で再構築（本文ロスなし）、旧 HTML 形式の未送信保留はデプロイ前 drain・残存破棄を運用手順化する
  - _Requirements: 8.1, 8.3_

- [ ] 5. (P) HTML→JSON 移行パイプライン（一度きり） — Task 3・4 と並行可（移行ツール境界 / 前提: Task 1・2）
- [ ] 5.1 (P) 変換環境と Stage2 変換コア（frontend jsdom + generateJSON）
  - HTML→JSON 変換専用の devDependency を追加し、実行時バンドルへ新規外部ライブラリを増やさない
  - 共有拡張ファクトリと同一のノード定義で HTML を ProseMirror JSON へロスレス変換する
  - 空相当 HTML は空 doc へ変換、解釈不能行はエラー記録し握り潰さず継続、Memo は空 doc フォールバック（原本 HTML は退避対象）にする
  - 変換と同時に `extractPlainText` で `contentText` を生成し、id キーで冪等（再実行しても結果不変）にする
  - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7_

- [ ] 5.2 (P) Stage1 / Stage3（export / import）と冪等書戻し
  - Stage1 でメモ・ノートブックの id と本文を中間形式へエクスポートし、Notebook の NULL 本文を保持する
  - Stage3 で変換結果（`contentJson` / `contentText`）を staging 列へ id 突合で書戻し、原本 `content` は無改変に保つ
  - Notebook の解釈不能・NULL 行は変換せず NULL のまま維持する
  - 前提: staging 列（Task 2.1）
  - _Requirements: 2.5, 7.3_

- [ ] 5.3 検証・dry-run・件数突合レポート
  - Stage2 単独で書込ゼロの dry-run（変換のみ検証）を提供する
  - 移行前後の件数突合、サンプル往復忠実度（変換→描画相当で代表構造の情報欠落ゼロ確認）、空 doc フォールバック件数を集約レポートする
  - 不整合・件数不一致・フォールバック閾値超過を検出した場合に cutover を実行せず中断できる状態（失敗 id 集約）にする
  - `SET NOT NULL` 前提として `contentJson` 全行非 NULL を確認する
  - 前提: 5.1（変換コア）・5.2（export/import）
  - _Requirements: 2.3, 7.1, 7.2, 7.5_

- [ ] 6. 統合・非回帰の検証（前提: Task 3・4・5）
- [ ] 6.1 (P) バックエンド統合テスト（write-path・検索・last-write-wins）
  - create/update で `content`(JSONB) と `contentText` が同時永続化され、取得が JSON 値を返すことを検証する
  - `contentText` 部分一致で本文がヒットし、構造キー名で誤ヒットせず、検索エンドポイント契約が維持されることを検証する
  - `clientUpdatedAt` 比較の 409 が JSON 化後も不変であることを検証する
  - _Requirements: 4.3, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4_

- [ ] 6.2 (P) 移行 E2E（dry-run + import + verify + 冪等再実行）
  - dry-run→import→verify の一連を実 DB 相当で通し、件数突合と往復忠実度を検証する
  - 同一データへの再実行で結果が変わらない冪等性を検証する
  - _Requirements: 2.3, 2.7, 7.1, 7.5_

- [ ] 6.3 (P) 公開ビュー・自動保存・ラウンドトリップの E2E / 非回帰
  - 公開ビューが JSON から描画され、生 HTML 不使用・`.memo-content`/`prose`・テーマ・`rel` 属性が不変であることを検証する
  - 自動保存の 5 状態と編集停止 2 秒保存が JSON 入出力で不変であることを検証する
  - 編集→保存→再取得→描画のラウンドトリップで内容が一致することを検証する
  - 既存の不変条件テスト（contentSync / saveRoundTrip / PublicMemoRenderer / 公開不変条件）を JSON 形式に合わせて更新または同等保証へ差し替える
  - _Requirements: 3.6, 5.2, 5.3, 5.4, 5.5, 8.2, 8.4, 8.5_

## 補足

### 意図的に非採用の要件

- **Requirement 7.4（デュアルリード）**: 設計はビッグバン移行（書込フリーズ窓に安全性を依存）を採用し、文字列/JSON 両対応の読み取り機構を導入しない。7.4 は「Where ～ を採用する場合」の条件節であり、非採用のため矛盾なく除外する（design.md System Flows / Migration Strategy 参照）。

### 要件カバレッジ

- Requirement 1〜8 の全アクセプタンスクライテリア（7.4 を除く）をタスクにマッピング済み。7.4 は上記のとおり意図的に非採用。

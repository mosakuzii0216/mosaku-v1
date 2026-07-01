# Requirements Document

## Project Description (Input)

メモ・ノートブックの本文（content）の保存形式を HTML 文字列（Prisma String）から ProseMirror/TipTap の構造化 JSON（Prisma Json / PostgreSQL JSONB）へ移行する。

【現状】Memo.content は `String`（必須）、Notebook.content は `String?`（任意）で、フロントの TipTap エディタが `editor.getHTML()` で生成した HTML 文字列をそのまま保存している（frontend/src/components/editor/RichTextEditor.tsx:60、contentSync.ts）。読み込み時は `editor.commands.setContent(html)` で流し込み。公開メモビューも HTML をそのまま描画している。

【移行先】`editor.getJSON()` が返す ProseMirror ドキュメント JSON を保存し、DB カラムを JSONB 化する。

【目的】(1) 構造化データによる将来の部分更新・ブロック単位操作・全文検索の柔軟性、(2) HTML パース／サニタイズに依存しない安全なレンダリング、(3) スキーマ進化への耐性。7月計画（docs/project-plan-2026.md）のコア技術タスク。

【想定スコープ】Prisma migration（content: String → Json）、既存 HTML→JSON のデータ移行スクリプト（サーバーサイドで TipTap/ProseMirror schema を使い generateJSON でロスレス変換）、frontend エディタの getHTML→getJSON / setContent 切替、backend の DTO・serializer・自動保存 API の Json 対応、公開メモビューの JSON→HTML レンダリング対応。

【必須制約】既存メモのデータロスゼロ（ロールバック可能なマイグレーション）、自動保存・公開共有・本文面テーマスタイル（.memo-content）の挙動を壊さない、外部 JS ライブラリは TipTap/ProseMirror 既存資産のみで実現、段階移行（デュアルリード期間の要否は design で判断）。

## Introduction

本スペックは、メモ・ノートブック本文の保存形式を **HTML 文字列（Prisma `String`）から ProseMirror/TipTap の構造化 JSON（Prisma `Json` / PostgreSQL JSONB）へ移行する**。現状はエディタが `editor.getHTML()` で得た HTML 文字列をそのまま保存し（`RichTextEditor.tsx:60`）、読込時は `setContent(html)`、公開ビューも同一拡張ファクトリで HTML をレンダリングしている。これを `editor.getJSON()` の ProseMirror ドキュメント JSON 保存へ切り替え、DB カラムを JSONB 化する。

狙いは、(1) 構造化データによる将来のブロック単位操作・部分更新・本文検索の柔軟性、(2) HTML パース／サニタイズに依存しない安全なレンダリング、(3) スキーマ進化への耐性、の 3 点。これは 7 月計画のコア技術タスクである。

本移行は**データ移行を伴うフルスタックのフォーマット変更**であり、最大の制約は「**既存メモのデータロスゼロ・ロールバック可能**」である。あわせて、自動保存（5 状態インジケーター・編集停止後 2 秒保存）、公開共有、本文面テーマスタイル（`.memo-content`）、本文検索（現在は `content` 文字列への `contains` で実現＝`memo.service.ts:197/247`）といった既存挙動を壊さないこと、追加の外部 JS ライブラリをアプリ実行時バンドルに増やさないこと（既存の TipTap/ProseMirror 資産のみ）を必須要件とする。段階移行におけるデュアルリード期間の要否は design で判断する。

### 非スコープ（本スペックで作らないもの）

- **本文検索の刷新**（PostgreSQL `tsvector` 全文検索化・ランキング・関連度順）。本スペックは「現行同等の本文テキスト検索の維持」までとし、検索体験の高度化は別スペック。
- **ブロック単位の部分更新 API の新設**。構造化による将来の柔軟性は「土台の確保」までとし、新規 API 追加は行わない。
- **エディタ拡張（ノード/マーク）の追加・変更**。移行はフォーマット切替に限定し、編集機能の仕様変更は含めない。
- **content 以外のドメイン**（タグ・テーマ・招待・認証・ゴミ箱）の挙動変更。

### Requirement Grouping

- **スキーマ・データ移行（データロスゼロの中核）**: Requirement 1（JSONB スキーマ） / Requirement 2（ロスレス変換） / Requirement 7（段階移行・検証・ロールバック）
- **フロントエンドの入出力切替**: Requirement 3（エディタの JSON 入出力） / Requirement 5（公開ビューの JSON 描画）
- **バックエンド契約の JSON 対応**: Requirement 4（DTO・自動保存 API）
- **既存機能の継続性**: Requirement 6（本文検索） / Requirement 8（非回帰・制約遵守）

## Requirements

### Requirement 1: データベーススキーマの JSONB 化

**Objective:** As a Mosaku 開発者, I want メモ・ノートブック本文の保存カラムを文字列から JSONB（Prisma `Json`）型へ変更したい, so that 本文を構造化データとして保存・操作でき、スキーマ進化に耐えられる

#### Acceptance Criteria

1. The Mosaku Database Schema shall `Memo.content` を Prisma `Json` 型（PostgreSQL JSONB）かつ NOT NULL として定義する
2. The Mosaku Database Schema shall `Notebook.content` を Prisma `Json` 型（PostgreSQL JSONB）かつ NULL 許容として定義する
3. When スキーマ変更マイグレーションを適用した時, the Schema Migration shall 既存行の `content` を保持したままカラム型を JSONB へ変換し、データを破棄するカラム削除・再作成（drop→add）を行わない
4. The Schema Migration shall 変更前のカラム型およびデータへ復元できる、ロールバック可能な構成（down マイグレーションまたは退避列/手順）を備える
5. When スキーマ変更後に Prisma Client を再生成した時, the Mosaku Backend shall `content` を `Json` 型として型安全に参照できる（`any` を介在させない）

### Requirement 2: 既存 HTML 本文のロスレス JSON 移行

**Objective:** As a Mosaku ユーザー, I want 既存メモ・ノートブックの本文が新形式へ移行されても内容が一切失われないでほしい, so that これまで書き溜めた内容を安心して使い続けられる

#### Acceptance Criteria

1. When 移行処理が既存の HTML 文字列 `content` を処理した時, the Content Migration Script shall TipTap/ProseMirror の `generateJSON` を用いて ProseMirror ドキュメント JSON へ変換する
2. The Content Migration Script shall 変換に用いるスキーマ（ノード・マーク定義）を、エディタが使用する拡張セット（`createEditorExtensions` と同一のノード定義）と一致させる
3. When 変換後 JSON をレンダリングした結果を元 HTML と比較した時, the Content Migration Script shall 見出し（H1〜H3）・箇条書き/番号リスト・チェックリスト・コードブロック・引用・リンク・装飾（太字/斜体/取消線）などの既存構造を保持する（表示上の情報欠落ゼロ）
4. If `content` が空文字列または空相当の HTML（空段落のみ等）である場合, the Content Migration Script shall 有効な空の ProseMirror ドキュメント（`doc` ノード）へ変換する
5. If `Notebook.content` が NULL である場合, the Content Migration Script shall NULL のまま維持し JSON へ変換しない
6. If ある行の HTML がスキーマで解釈できない要素を含む場合, the Content Migration Script shall 当該行をエラーとして記録し、元データを破壊せず（握り潰さず）移行処理を継続できる
7. The Content Migration Script shall 同一データに対して再実行しても結果が変わらない（冪等な）方法で移行する

### Requirement 3: リッチテキストエディタの JSON 入出力切替

**Objective:** As a Mosaku ユーザー, I want エディタで書いた内容が構造化 JSON として保存・復元されてほしい, so that 表示や自動保存の挙動は今まで通りで、かつ将来のブロック操作に備えられる

#### Acceptance Criteria

1. When ユーザーがエディタ本文を編集した時, the Mosaku Rich Text Editor shall `editor.getJSON()` が返す ProseMirror ドキュメント JSON を `onChange` で通知する（HTML 文字列を通知しない）
2. When 親から外部の JSON content が渡された時（別メモ切替・新規作成・サーバー再取得）, the Mosaku Rich Text Editor shall `setContent` に JSON を渡し、`emitUpdate` を抑止して本文へ反映する
3. While ユーザーが文字入力中, the Mosaku Rich Text Editor shall 自己エコー（自身が直近に emit した JSON）を外部変更と誤認して再適用せず、input rule の巻き戻しを起こさない
4. The Mosaku Rich Text Editor shall content 同期の等価判定を JSON 値の構造的等価で行い、HTML 文字列一致に依存しない
5. When 新規メモを作成した時, the Mosaku Rich Text Editor shall 有効な空の ProseMirror ドキュメントを初期値として扱う
6. When `getJSON()` で得た値を保存し `setContent` で復元した時, the Mosaku Rich Text Editor shall 往復で同一の内容になる（ラウンドトリップ一致）

### Requirement 4: バックエンド API・DTO の JSON 対応

**Objective:** As a Mosaku 開発者, I want メモ・ノートブックの作成/更新/自動保存 API が JSON 本文を受理・永続化したい, so that エディタの構造化データをそのまま安全に保存できる

#### Acceptance Criteria

1. The Mosaku Memo API shall `CreateMemoDto` / `UpdateMemoDto` の `content` を JSON（オブジェクト）として受理する型・バリデーションに変更する（文字列前提の `@IsString` を JSON 検証へ置換する）
2. The Mosaku Notebook API shall ノートブックの作成/更新 DTO の `content` を JSON または `null` として受理する
3. When クライアントが JSON content を含む保存リクエストを送信した時, the Mosaku Memo API shall その JSON を JSONB カラムへロスなく永続化する
4. If リクエストの `content` が有効な JSON オブジェクト（ProseMirror ドキュメント形）でない場合, the Mosaku Memo API shall バリデーションエラー（400 系）を返し保存しない
5. While 自動保存リクエストが `clientUpdatedAt` を伴う時, the Mosaku Memo API shall 既存の last-write-wins 比較ロジックを変更せず維持する
6. When メモ/ノートブック取得 API がレスポンスを返す時, the Mosaku Memo API shall `content` を JSON 値として返す（文字列へ直列化しない）

### Requirement 5: 公開メモビューの JSON レンダリング

**Objective:** As a 公開メモの閲覧者, I want 公開メモが構造化 JSON から正しく描画されてほしい, so that 共有された内容を安全に・これまで通りの見た目で読める

#### Acceptance Criteria

1. When 公開メモ取得サービスが共有メモを返す時, the Public Memo Sharing Service shall `content` を JSON 値として返す
2. When 公開メモページが JSON content を受け取った時, the Public Memo Renderer shall 編集側と同一の拡張ファクトリ（`createEditorExtensions`, `editable:false`）で JSON をレンダリングする
3. The Public Memo Renderer shall HTML 文字列を直接 DOM 挿入する方式（`dangerouslySetInnerHTML` 等の生 HTML 注入）を用いずに描画する
4. The Public Memo Renderer shall 本文面のテーマスタイル（`.memo-content` / `prose` クラス）が従来通り適用された状態で描画する
5. The Public Memo Renderer shall リンクのセキュリティ属性（`rel="noopener noreferrer nofollow"` / `javascript:` 等の危険スキーム排除）を編集側と同一に保つ

### Requirement 6: 本文検索の継続性

**Objective:** As a Mosaku ユーザー, I want 本文が JSONB になっても本文テキストでメモを検索できてほしい, so that これまで通り内容からメモを探し出せる

#### Acceptance Criteria

1. While `content` が JSONB として保存されている, the Mosaku Memo Search shall 本文テキストに対する検索（タイトル＋本文の部分一致）を引き続き提供する
2. When ユーザーが検索クエリを入力した時, the Mosaku Memo Search shall JSONB content 内の可読テキストにマッチするメモを検索結果に含める
3. The Mosaku Memo Search shall 検索対象を本文の可読テキストに限定し、JSON 構造のキー名・ノードタイプ名（例: `"type"` / `"paragraph"`）が検索語に誤ヒットしない方式とする
4. The Mosaku Memo Search shall 既存検索エンドポイント（`/memos/search`・`/memos/search/paginated`）の入出力契約（クエリ `q`・タグ絞り込み・ページネーション）を維持する

### Requirement 7: データロスゼロを保証する段階移行とロールバック

**Objective:** As a Mosaku 運用者, I want 移行を検証可能・ロールバック可能な段階手順で実施したい, so that 万一の不整合でも既存データを失わず元に戻せる

#### Acceptance Criteria

1. The Mosaku Migration Process shall 移行前後で全メモ・全ノートブックの件数および本文の対応関係を検証する手段（移行前後の突合・サンプリング検証）を備える
2. If 移行後の検証で変換不整合・件数不一致を検出した場合, the Mosaku Migration Process shall 移行を中断し、変更前データへロールバックできる状態を保つ
3. The Mosaku Migration Process shall 移行のいずれの段階でも元本文を復元できる構成とし、既存メモのデータロスをゼロとする
4. Where 段階移行のためのデュアルリード（文字列/JSON 両対応の読み取り）を採用する場合, the Mosaku Backend shall 移行未完了データ（文字列）と移行済みデータ（JSON）の双方を破綻なく読み取れる
5. The Mosaku Migration Process shall 本番適用前に dry-run（変換のみ・書込なし）で検証できる手順を提供する

### Requirement 8: 制約遵守と既存挙動の非回帰

**Objective:** As a Mosaku 開発者, I want 移行が既存の自動保存・テーマ・他ドメインの挙動を壊さず、アプリ実行時の外部ライブラリも増やさないでほしい, so that 差別化軸（デザイン/世界観）と既存品質を保ったまま保存基盤だけ進化できる

#### Acceptance Criteria

1. The Mosaku Rich Text Editor and Public Memo Renderer shall HTML↔JSON 変換・描画を既存の TipTap/ProseMirror 拡張資産のみで実現し、アプリ実行時バンドル（frontend / backend サーバー）へ新規外部 JS ライブラリを追加しない（一度きりの移行スクリプトが必要とする HTML パース手段は design で扱う）
2. The Mosaku Auto Save shall 5 状態インジケーター（idle/pending/saving/saved/error）と「編集停止後 2 秒で保存」の挙動を移行前後で維持する
3. The Mosaku Content Migration shall タグ・テーマ・ゴミ箱（Soft Delete）・認証・招待など `content` 以外のドメインの挙動に影響を与えない
4. The Mosaku App shall 本文面テーマスタイル（`.memo-content`）の見た目・適用範囲を移行前後で変えない
5. The Mosaku Content Migration shall 既存テスト（`contentSync` / `saveRoundTrip` / `PublicMemoRenderer` / 公開不変条件テスト等）が表現する不変条件を、JSON 形式に合わせて維持または同等の保証へ更新する

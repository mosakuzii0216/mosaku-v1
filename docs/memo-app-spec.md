# メモアプリ 高機能化 検討資料

> 最終更新：2026-03-19

## このドキュメントの位置づけ

**開発の進行軸は [`docs/project-plan-2026.md`](./project-plan-2026.md) を優先する。**

このドキュメントは「機能の高機能化」に特化した設計資料であり、cc-sdd の直接対象ではない。
以下の用途で参照する。

- **ドッグフーディング中（Phase 1: 5〜7月）**: 摩擦として浮かんだ機能の設計参考（チェックリスト・ピン留め・全文検索など）
- **友人公開後（Phase 3〜: 10月〜）**: フィードバックをもとに機能を選んで cc-sdd スペック化する際の設計書
- **AI連携・共有・インポート**: project-plan には未計画。実装判断は友人公開後のヒアリング次第

> **開発ペースの注意**: このドキュメントのスケジュール（Phase 1〜4 約4ヶ月）は週10〜15時間想定。
> project-plan は週5時間（テーマ作成込み）のため、そのままの期間では実現不可能。

---

---

## 1. プロジェクト概要

| 項目               | 内容                     |
| ------------------ | ------------------------ |
| アプリの強み       | ハイセンスなテーマが豊富 |
| ターゲットユーザー | 一般ユーザー全般         |
| 現在のエディタ     | シンプルなテキスト入力   |
| フロントエンド     | React（Vercelデプロイ）  |
| バックエンド       | Cloud Run                |
| DB                 | Supabase（PostgreSQL）   |

---

## 2. 追加したい機能の方向性

- リッチエディタ（Markdown / コードブロック等）
- 情報整理・構造化（タグ / フォルダ / リンク）
- AI連携（要約・分類・提案）
- 共有機能（読み取り専用の共有リンク）
- データインポート（他サービスからの乗り換え対応）

---

## 3. ロードマップ

### Phase 1｜エディタ強化（土台）

#### 1-0. エディタライブラリ比較

|                  | **Tiptap**                | **Quill.js**     | **Slate.js** | **Lexical** |
| ---------------- | ------------------------- | ---------------- | ------------ | ----------- |
| 開発元           | OSS（企業スポンサーあり） | OSS              | OSS          | Meta        |
| ベース           | ProseMirror               | 独自             | 独自         | 独自        |
| Reactサポート    | ◎ 公式                    | △ 非公式ラッパー | ◎ React専用  | ◎ 公式      |
| 拡張性           | ◎ 豊富な公式拡張          | △ 限定的         | ◎ 自由度高い | ○ 拡張可能  |
| 学習コスト       | 低〜中                    | 低               | 高           | 中          |
| Collab対応       | ◎ Yjs公式サポート         | △ 自前実装       | △ 自前実装   | ○ Yjs対応可 |
| AI連携のしやすさ | ◎                         | △                | ○            | ○           |
| メンテナンス状況 | 活発                      | 低調⚠️           | 普通         | 活発        |

**各候補の所感**

- **Tiptap**：ProseMirrorの複雑さをラップ。公式拡張が豊富でチェックリスト・コードブロック・画像などを設定だけで使える。有料のProプラン拡張がある点は注意。
- **Quill.js**：歴史が長くシンプルだが、メンテが低調。React対応も非公式。今から新規採用はリスクあり。
- **Slate.js**：「エディタを自分で作るフレームワーク」。自由度最高だが基本機能も自前実装が必要で学習コストが高い。今回のケースでは過剰。
- **Lexical**：Metaが開発。軽量・パフォーマンス良好・モバイル対応が強い。エコシステムは発展途上だが伸びている。

**選定結論**

| 判断軸                   | Tiptap | Lexical     |
| ------------------------ | ------ | ----------- |
| 今すぐ使える拡張の豊富さ | ◎      | ○           |
| 学習コスト               | 低〜中 | 中          |
| 長期的なメンテ安心感     | ○      | ◎（Meta）   |
| モバイル対応             | ○      | ◎           |
| エコシステムの成熟度     | ◎      | △（発展中） |

> **採用：Tiptap**
> 拡張エコシステムの成熟度と React との親和性でTiptapが優位。モバイル重視・長期安定重視に振るならLexicalを再検討する価値あり。

---

#### 1-1. 導入パッケージ

```bash
# コア
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit

# 拡張（必要に応じて追加）
npm install @tiptap/extension-placeholder
npm install @tiptap/extension-task-list @tiptap/extension-task-item
npm install @tiptap/extension-code-block-lowlight lowlight
npm install @tiptap/extension-image
npm install @tiptap/extension-link
npm install @tiptap/extension-character-count
```

#### 1-2. 実装する機能

| 機能                                     | 拡張                     | 優先度 |
| ---------------------------------------- | ------------------------ | ------ |
| 見出し / 太字 / 斜体                     | StarterKit               | 高     |
| チェックリスト                           | TaskList + TaskItem      | 高     |
| コードブロック（シンタックスハイライト） | CodeBlockLowlight        | 高     |
| プレースホルダー                         | Placeholder              | 高     |
| リンク挿入                               | Link                     | 中     |
| 画像添付                                 | Image + Supabase Storage | 中     |
| 文字数カウント                           | CharacterCount           | 低     |

#### 1-3. データ保存設計

エディタの内容は **TiptapのJSON形式**（`editor.getJSON()`）でSupabase DBに保存する。

```sql
-- memosテーブルの想定スキーマ
ALTER TABLE memos
  ADD COLUMN content jsonb,        -- Tiptap JSON
  ADD COLUMN content_text text;    -- 全文検索用プレーンテキスト（editor.getText()）
```

- `content`（jsonb）：エディタの構造データ。レンダリング・編集に使用
- `content_text`（text）：全文検索（Phase 2）のために平文も同時保存

#### 1-4. 自動保存の設計

リアルタイム保存はSupabase負荷・UXのバランスを考慮し、**デバウンス保存**を採用。

```ts
// 例：1秒間入力が止まったら自動保存
const handleUpdate = useDebouncedCallback(async ({ editor }) => {
	await supabase
		.from('memos')
		.update({
			content: editor.getJSON(),
			content_text: editor.getText(),
		})
		.eq('id', memoId);
}, 1000);
```

#### 1-5. 移行方針（既存データ）

現在のシンプルテキストからの移行は以下の手順で対応する。

1. 既存の `content`（text型）を読み込む
2. Tiptapの `generateJSON()` でJSONに変換してDBを更新
3. 変換スクリプトをCloud Run上のマイグレーションタスクとして実行

#### 1-6. 実装ステップ

- [ ] Tiptapパッケージのインストール・基本動作確認
- [ ] ツールバーコンポーネントの実装（テーマに合わせたスタイリング）
- [ ] Supabase DBスキーマの変更（content を jsonb へ）
- [ ] デバウンス自動保存の実装
- [ ] 既存データの移行スクリプト作成・実行
- [ ] 画像添付（Supabase Storage連携）

---

### Phase 2｜情報整理・構造化

#### 2-1. 実装する機能

- [ ] タグ — フリーワードで柔軟に分類
- [ ] フォルダ / ワークスペース — 階層構造でメモを整理
- [ ] 双方向リンク（Backlink）— メモ同士を繋ぐ
- [ ] ピン留め / スター — 重要メモを即アクセス
- [ ] 全文検索 — content_text を使った高速検索

#### 2-2. DBスキーマ設計

```sql
-- ユーザー（Supabase Authと連携）
users
  id          uuid PRIMARY KEY  -- auth.users.id と一致
  display_name text
  created_at  timestamptz

-- フォルダ（階層構造）
folders
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE
  parent_id   uuid REFERENCES folders(id) ON DELETE SET NULL  -- NULLがルート
  name        text NOT NULL
  order_index integer DEFAULT 0  -- 並び順
  created_at  timestamptz DEFAULT now()

-- メモ
memos
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE
  folder_id    uuid REFERENCES folders(id) ON DELETE SET NULL
  title        text
  content      jsonb          -- Tiptap JSON
  content_text text           -- 全文検索用プレーンテキスト
  is_pinned    boolean DEFAULT false
  is_starred   boolean DEFAULT false
  created_at   timestamptz DEFAULT now()
  updated_at   timestamptz DEFAULT now()

-- タグ
tags
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid()
  user_id uuid REFERENCES users(id) ON DELETE CASCADE
  name    text NOT NULL
  UNIQUE (user_id, name)  -- 同一ユーザー内でタグ名重複禁止

-- メモとタグの中間テーブル（多対多）
memo_tags
  memo_id uuid REFERENCES memos(id) ON DELETE CASCADE
  tag_id  uuid REFERENCES tags(id) ON DELETE CASCADE
  PRIMARY KEY (memo_id, tag_id)

-- 双方向リンク（有向グラフ）
memo_links
  from_memo_id uuid REFERENCES memos(id) ON DELETE CASCADE
  to_memo_id   uuid REFERENCES memos(id) ON DELETE CASCADE
  PRIMARY KEY (from_memo_id, to_memo_id)
  CHECK (from_memo_id <> to_memo_id)  -- 自己参照禁止

-- 共有リンク
memo_shares
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
  memo_id     uuid REFERENCES memos(id) ON DELETE CASCADE
  share_token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url')
  expires_at  timestamptz  -- NULLは無期限
  created_at  timestamptz DEFAULT now()
```

#### 2-3. 全文検索の設計

`content_text` に対して PostgreSQL の全文検索インデックスを貼る。

```sql
-- 日本語対応：pg_bigm 拡張を使用（Supabaseで利用可能）
CREATE EXTENSION IF NOT EXISTS pg_bigm;

CREATE INDEX idx_memos_content_text
  ON memos
  USING gin (content_text gin_bigm_ops);

-- 検索クエリ例
SELECT id, title, content_text
FROM memos
WHERE content_text LIKE '%検索キーワード%'
  AND user_id = $1
ORDER BY updated_at DESC;
```

> `tsvector` より `pg_bigm` を推奨する理由：日本語はスペース区切りがないため `tsvector` の形態素解析と相性が悪い。`pg_bigm` はBigram方式でマルチバイト文字に強い。

#### 2-4. 双方向リンクの設計

Tiptap エディタ内で `[[メモタイトル]]` 記法 or メンション形式でリンクを作成。

```
保存時の処理フロー：
1. editor.getJSON() でコンテンツを取得
2. JSON内の link ノードを走査し、リンク先 memo_id を抽出
3. memo_links テーブルを差分更新（古いリンク削除 → 新しいリンク追加）
```

バックリンクの取得（「このメモにリンクしているメモ」）:

```sql
SELECT m.*
FROM memos m
JOIN memo_links ml ON ml.from_memo_id = m.id
WHERE ml.to_memo_id = $1;  -- 表示中のメモID
```

> `memo_links` を有向グラフ（`from → to` の一方向）として持つことで、「リンク先」と「バックリンク」の両方を1テーブルで表現できる。

#### 2-5. Row Level Security（RLS）

Supabase の RLS で「自分のデータしか見えない」を保証する。

```sql
-- memos テーブルの例
ALTER TABLE memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ユーザーは自分のメモのみ操作可能"
  ON memos
  FOR ALL
  USING (auth.uid() = user_id);

-- folders, tags, memo_tags, memo_links にも同様に設定

-- 共有トークン経由の読み取りを許可
CREATE POLICY "共有トークンで読み取り可能"
  ON memos
  FOR SELECT
  USING (
    id IN (
      SELECT memo_id FROM memo_shares
      WHERE share_token = current_setting('app.share_token', true)
        AND (expires_at IS NULL OR expires_at > now())
    )
  );
```

#### 2-6. 実装ステップ

- [ ] DBスキーマのマイグレーション作成・実行
- [ ] RLS ポリシーの設定
- [ ] フォルダCRUD APIの実装（Cloud Run）
- [ ] タグCRUD・メモへの付与APIの実装
- [ ] 全文検索APIの実装（pg_bigm）
- [ ] 双方向リンクの保存ロジック実装
- [ ] バックリンク表示UIの実装
- [ ] ピン留め / スター機能の実装

---

### Phase 3｜AI連携

#### 3-1. 実装する機能

| 機能               | 概要                         | 優先度 |
| ------------------ | ---------------------------- | ------ |
| 自動要約           | 長文メモをワンクリックで要約 | 高     |
| 自動タグ提案       | 内容から適切なタグを提案     | 高     |
| 続きを書く / 推敲  | 執筆補助・文章改善           | 中     |
| Q&A検索            | 自然言語でメモを横断検索     | 中     |
| インポート時AI整理 | Phase 5 Step 3と連携         | 低     |

#### 3-2. アーキテクチャ全体像

```
[React（Vercel）]
　　│
　　│ API リクエスト（JWT付き）
　　▼
[Cloud Run｜AI API サーバー]
　　│  ├ /api/ai/summarize
　　│  ├ /api/ai/suggest-tags
　　│  ├ /api/ai/complete
　　│  └ /api/ai/search
　　│
　　│ Anthropic API 呼び出し
　　▼
[Claude API（claude-sonnet-4-5）]
　　│
　　│ 必要に応じてメモ取得
　　▼
[Supabase DB]
```

**Cloud Run にAIエンドポイントを集約する理由**

- APIキーをフロントエンドに露出させない
- レート制限・コスト管理を一箇所で制御できる
- プロンプトを変更する際もバックエンドだけ修正すれば済む

#### 3-3. 各機能の実装方針

**① 自動要約**

```ts
// POST /api/ai/summarize
// Request: { memo_id: string }
// Response: { summary: string }

const prompt = `
以下のメモを3〜5文で要約してください。
重要なポイントを漏らさず、簡潔にまとめてください。

---
${memoText}
---
`;
```

- `content_text`（プレーンテキスト）をそのままプロンプトに渡す
- ストリーミングレスポンス（`stream: true`）でUXを改善する

**② 自動タグ提案**

```ts
// POST /api/ai/suggest-tags
// Request: { memo_id: string, existing_tags: string[] }
// Response: { suggested_tags: string[] }

const prompt = `
以下のメモの内容から、適切なタグを3〜5個提案してください。
既存のタグがあれば優先して使用し、不足する場合は新しいタグを提案してください。

既存タグ一覧: ${existingTags.join(', ')}

メモ内容:
---
${memoText}
---

JSON配列で返してください。例: ["タグ1", "タグ2", "タグ3"]
`;
```

- レスポンスはJSON形式で受け取りパース
- ユーザーが確認・選択してから適用する（自動適用しない）

**③ 続きを書く / 推敲**

```ts
// POST /api/ai/complete
// Request: { memo_id: string, mode: 'continue' | 'refine', selection?: string }
// Response: streaming text

// mode: 'continue' → カーソル位置以降の続きを生成
// mode: 'refine'   → 選択テキストを推敲・改善
```

- Tiptap の `editor.commands.insertContent()` でストリーミング結果をリアルタイム挿入
- 推敲モードは選択テキストを置き換える形で適用

**④ Q&A検索（RAG）**

最も複雑な機能。全メモを対象に自然言語で質問できる。

```
処理フロー：
1. ユーザーが「先週決めた技術選定は？」と入力
2. Supabase DB から該当ユーザーの全 content_text を取得
3. Claude に「以下のメモ群の中から質問に答えてください」とプロンプト
4. 回答と一緒に「参照元メモID」を返す
5. フロントで回答 + 参照元メモへのリンクを表示
```

> **スケールへの対応**
> メモが増えてきたら全文をそのまま渡すのではなく、pgvector（Supabase対応）でベクトル検索を使い関連メモだけを抽出してからClaudeに渡すRAG構成に移行する。

#### 3-4. ストリーミング実装（フロント側）

```ts
const response = await fetch('/api/ai/summarize', {
	method: 'POST',
	body: JSON.stringify({ memo_id: memoId }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
	const { done, value } = await reader.read();
	if (done) break;
	const chunk = decoder.decode(value);
	setSummary((prev) => prev + chunk); // リアルタイムで追記
}
```

#### 3-5. コスト管理の設計

| 対策       | 内容                                                       |
| ---------- | ---------------------------------------------------------- |
| 文字数制限 | `content_text` が一定文字数を超える場合は先頭N文字のみ渡す |
| レート制限 | ユーザーごとに1日あたりのAIリクエスト数を制限              |
| キャッシュ | 同じメモの要約は一定時間DBにキャッシュして再利用           |
| モデル選択 | 要約・タグ提案は Haiku、Q&A検索は Sonnet と使い分ける      |

#### 3-6. 実装ステップ

- [ ] Cloud Run に AI エンドポイントの雛形を作成
- [ ] Anthropic APIキーの環境変数設定（Cloud Run Secrets）
- [ ] 自動要約APIの実装（ストリーミング対応）
- [ ] 自動タグ提案APIの実装
- [ ] フロントの要約・タグ提案UIの実装
- [ ] 続きを書く / 推敲APIの実装
- [ ] Q&A検索APIの実装（シンプル版）
- [ ] コスト管理ロジックの実装（レート制限・キャッシュ）
- [ ] pgvector導入によるRAG構成への移行（メモ増加後）

---

### Phase 4｜共有機能

> **方針：** リアルタイム共同編集・コメントは実装しない。「メモを誰でも見られる状態にする」共有リンク機能のみに絞る。

#### 4-1. 実装する機能

| 機能           | 概要                       | 優先度 |
| -------------- | -------------------------- | ------ |
| 共有リンク生成 | 読み取り専用で外部公開     | 高     |
| 有効期限設定   | 共有リンクの期限を設定可能 | 中     |
| 共有解除       | リンクを無効化する         | 中     |

#### 4-2. 共有リンクの設計

DBスキーマは Phase 2 の `memo_shares` テーブルを使用。RLSポリシーも Phase 2 で設定済み。

**共有URL の形式**

```
https://yourapp.com/shared/{share_token}
```

**アクセス制御のフロー**

```
1. 共有URLにアクセス
2. share_token で memo_shares を検索
3. expires_at を確認（期限切れなら403）
4. 未ログインユーザーも読み取り専用で閲覧可能
```

#### 4-3. 実装ステップ

- [ ] 共有リンク生成・解除APIの実装
- [ ] 共有ページ（`/shared/[token]`）の実装（読み取り専用）
- [ ] 有効期限設定UIの実装

---

### Phase 5｜データインポート（乗り換え対応）

> Phase 1〜2 完了後に並行着手可能。

#### Step 1｜ファイルアップロード型（Markdown / HTML）

**対応形式と対応競合**

| フォーマット            | 対応競合               |
| ----------------------- | ---------------------- |
| Markdown（.md / .zip）  | Notion, Obsidian, Bear |
| HTML                    | Notion, Bear           |
| ENEX（Evernote独自XML） | Evernote               |

**ユーザー操作フロー**

```
1. 競合アプリで「Markdownとしてエクスポート」
2. zipファイルをアプリにドラッグ&ドロップ
3. フォルダ構造・タグを自動マッピングしてインポート
```

**実装方針**

- Cloud Run上にパースAPIを用意
- zip展開 → ファイルを再帰的に走査 → Tiptap JSONに変換 → Supabase DBへ一括insert
- フォルダ構造はディレクトリ階層をそのままフォルダとしてマッピング

**実装ステップ**

- [ ] Markdownパーサーの選定・実装（`unified` / `remark` 等）
- [ ] zip展開・ファイル走査ロジックの実装（Cloud Run）
- [ ] Tiptap JSON変換処理の実装
- [ ] フロントのアップロードUI実装（ドラッグ&ドロップ）
- [ ] インポート進捗表示・エラーハンドリング
- [ ] ENEXパーサーの実装（Evernote対応）

---

#### Step 2｜Notion API連携

**フロー**

```
1. 「Notionから取り込む」ボタンをクリック
2. NotionのOAuth認証画面へリダイレクト
3. 認証後、ワークスペースのページ一覧を取得
4. インポートするページを選択 → 変換・保存
```

**実装方針**

- Notion OAuth 2.0 で認証（Cloud Runでトークン管理）
- Notion Blocks API → Tiptap JSON への変換マッパーを実装
- ページのネスト構造をフォルダ階層として再現

**実装ステップ**

- [ ] Notion OAuth アプリ登録・認証フローの実装
- [ ] Notion Blocks → Tiptap JSON 変換マッパーの実装
- [ ] ページ選択UIの実装（ツリー表示）
- [ ] 差分インポート（2回目以降の更新取り込み）の検討

---

#### Step 3｜AIパース型インポート（Step 1 + AI）

Phase 3のAI連携と組み合わせ、インポート時にフォルダ・タグ・リンクをAIが自動整理する。

```
Before：Notionのエクスポートはフォルダが深くネストされ、
　　　　タグも失われがちで、構造が崩れやすい

After（AI解析）：
　- 内容からタグを自動推定
　- 関連するメモ同士をリンクで自動接続
　- フォルダ構造を整理・フラット化
```

**実装ステップ**

- [ ] インポート後にAIタグ提案を自動実行
- [ ] メモ間の類似度分析 → 双方向リンクの自動生成
- [ ] インポート結果のプレビュー・編集UI

---

## 4. 優先度の考え方

```
デザイン強み（既存）
　↓
Phase 1: エディタ強化　← 土台。ここなしに他は乗らない
　↓
Phase 2: 情報整理　← ユーザーが「使い続ける」理由になる
　↓　　　　　　　　 ※ Phase 5 Step 1〜2 を並行着手可
Phase 3: AI連携　← 差別化・話題性
　↓
Phase 4: 共有機能　← URLで誰でも見られる（軽量実装）
　↓
Phase 5: データインポート　← 乗り換えハードルを下げる
```

---

## 5. 技術スタック

| レイヤー       | 現状                    | 追加・変更                            |
| -------------- | ----------------------- | ------------------------------------- |
| フロントエンド | React（Vercelデプロイ） | —                                     |
| エディタ       | シンプルテキスト        | **Tiptap**                            |
| バックエンド   | Cloud Run               | AI エンドポイント追加                 |
| DB             | Supabase（PostgreSQL）  | pg_bigm 拡張追加                      |
| Auth           | 未確認                  | Supabase Auth                         |
| AI             | なし                    | **Anthropic API（Claude）**           |
| リアルタイム   | なし                    | （Phase 4は共有リンクのみのため不要） |

---

## 6. スケジュール（目安）

> ソロ開発・週末稼働（週10〜15時間）を想定した概算。

### 全体タイムライン

```
Month 1        Month 2        Month 3        Month 4        Month 5〜
│              │              │              │              │
Phase 1        Phase 2        Phase 3        Phase 4        Phase 5
エディタ強化   情報整理       AI連携         共有機能       インポート
               └─ Phase 5 Step 1〜2 並行着手可 ─────────────┘
```

| Phase                 | 期間     | 累計         |
| --------------------- | -------- | ------------ |
| Phase 1｜エディタ強化 | 約4週    | 1ヶ月        |
| Phase 2｜情報整理     | 約4週    | 2ヶ月        |
| Phase 3｜AI連携       | 約4〜6週 | 3〜3.5ヶ月   |
| Phase 4｜共有機能     | 約2週    | 3.5〜4ヶ月   |
| Phase 5｜インポート   | 約4〜6週 | 4.5〜5.5ヶ月 |

> Phase 1〜4 の最短リリースは**約4ヶ月**が目安。

### Phase 1｜エディタ強化（約4週間）

| 週     | 作業内容                                            |
| ------ | --------------------------------------------------- |
| Week 1 | Tiptap導入・基本動作確認・ツールバーUI実装          |
| Week 2 | DBスキーマ変更（content を jsonb へ）・自動保存実装 |
| Week 3 | 既存データ移行スクリプト作成・実行                  |
| Week 4 | 画像添付（Supabase Storage）・バグ修正・リリース    |

**マイルストーン：** リッチエディタで書けるようになる

### Phase 2｜情報整理・構造化（約4週間）

| 週     | 作業内容                                               |
| ------ | ------------------------------------------------------ |
| Week 1 | DBスキーマ作成（folders / tags / memo_links）・RLS設定 |
| Week 2 | フォルダ・タグのCRUD API実装                           |
| Week 3 | 双方向リンク保存ロジック・バックリンク表示UI           |
| Week 4 | 全文検索（pg_bigm）・ピン留め / スター・リリース       |

**マイルストーン：** メモを整理・分類して使い続けられるようになる

### Phase 3｜AI連携（約4〜6週間）

| 週     | 作業内容                                        |
| ------ | ----------------------------------------------- |
| Week 1 | Cloud Run に AI エンドポイント雛形・APIキー設定 |
| Week 2 | 自動要約API実装（ストリーミング）・UI           |
| Week 3 | 自動タグ提案API実装・UI                         |
| Week 4 | 続きを書く / 推敲API実装                        |
| Week 5 | Q&A検索API実装（シンプル版）                    |
| Week 6 | コスト管理ロジック・レート制限・リリース        |

**マイルストーン：** AIがメモ作成を補助してくれるようになる

### Phase 4｜共有機能（約2週間）

| 週     | 作業内容                                         |
| ------ | ------------------------------------------------ |
| Week 1 | memo_shares テーブル・RLS・共有リンク生成API     |
| Week 2 | 共有ページ（読み取り専用）・有効期限UI・リリース |

**マイルストーン：** メモをURLで誰でも見られるようになる

### Phase 5｜データインポート（約4〜6週間）

| 週        | 作業内容                                                |
| --------- | ------------------------------------------------------- |
| Week 1〜2 | Markdownパーサー・zip展開・Tiptap JSON変換（Cloud Run） |
| Week 3    | フロントのアップロードUI・進捗表示                      |
| Week 4    | Evernote（ENEX）対応                                    |
| Week 5〜6 | Notion API OAuth連携・ページ選択UI                      |

**マイルストーン：** 他サービスからの乗り換えができるようになる

---

## 7. 競合分析

### 主要競合の概要

|                  | **Notion**                    | **Obsidian**                    | **Bear**              |
| ---------------- | ----------------------------- | ------------------------------- | --------------------- |
| ターゲット       | チーム・個人全般              | 上級者・研究者                  | Apple圏の個人ユーザー |
| エディタ         | WYSIWYG（ブロック型）         | Markdownベース                  | Markdownベース        |
| 情報整理         | DB・階層ページ                | 双方向リンク・グラフビュー      | ハッシュタグ          |
| AI               | ◎ Notion AI（エージェント型） | △ プラグイン経由                | なし                  |
| コラボ           | ◎ リアルタイム共同編集        | △ 有料アドオン（Obsidian Sync） | ✕ なし                |
| デザイン         | 整っているが没個性            | ミニマル・カスタム重視          | ◎ 洗練されたUI        |
| プラットフォーム | 全プラットフォーム            | 全プラットフォーム              | Apple専用 ⚠️          |
| 価格             | Free〜$16/月                  | Free＋有料アドオン              | Free〜$2.99/月        |

### 各競合の強み・弱み

**Notion**

- 強み：AI機能が最も充実（2025年にエージェント型AIへ刷新）、コラボ・DB機能が強力、初心者に優しい
- 弱み：機能過多で重い、デザインが没個性、書くことへの集中を妨げるという声も多い

**Obsidian**

- 強み：双方向リンク・グラフビューが唯一無二、オフライン・プライバシー重視、カスタマイズ性が最高
- 弱み：学習コストが高い、コラボは有料アドオン、一般ユーザーには敷居が高い

**Bear**

- 強み：デザインが洗練されていてシンプル、ハッシュタグによる整理が直感的
- 弱み：Apple専用、コラボなし、高度な機能は少ない

### 市場のポジションマップ

```
　　　　　高機能
　　　　　　│
　Notion　 │
（重い）　 │
　　　　　　│　　　　　Obsidian
　　　　　　│　　　　（難しい）
一般向け───┼────────────上級者向け
　　　　　　│
　Bear　　 │
（Apple限定）│
　　　　　　│
　　　　　シンプル
```

### 自分たちのポジション（目指すべき場所）

```
　　　　　高機能
　　　　　　│
　　　　　　│　★ 目指すポジション
　　　　　　│　「デザインが美しく・使いやすく・高機能」
　　　　　　│
一般向け───┼────────────上級者向け
　　　　　　│
　　　　　　│
　　　　　シンプル
```

### 差別化戦略

1. **「Notionより美しく、Bearより高機能」**
   - Notionは高機能だがデザインが没個性。Bearは美しいがApple限定・機能が少ない。
   - → ハイセンスなテーマ × リッチな機能でこの間を狙う

2. **「Obsidianより始めやすい双方向リンク」**
   - Obsidianの双方向リンク・グラフビューは強力だが敷居が高い
   - → 一般ユーザーでも使えるシンプルな実装で取り込む（Phase 2）

3. **「AI連携をデザインの延長として体験させる」**
   - NotionのAIは機能としては強いが「ツール感」が強い
   - → テーマの世界観を壊さないUI/UXでAIを自然に組み込む（Phase 3）

---

## 8. 参考：技術用語メモ

### ProseMirrorとは

ブラウザ上でリッチテキストエディタを作るための**低レベルフレームワーク**。エディタの核となるエンジン部分を担う。

**構造のイメージ**

```
あなたのアプリ
　└── Tiptap          ← 使いやすいAPIでラップ
　　　　└── ProseMirror  ← エディタエンジン本体
　　　　　　　└── ブラウザ DOM
```

**ProseMirrorが解決していること**

- **ドキュメントをJSONツリーとして管理**：エディタの内容を構造化データとして扱う。`editor.getJSON()` で取れるデータの正体。
- **イミュータブルな状態管理**：編集操作を「トランザクション」として扱いUndo/Redoが堅牢に動く。
- **コラボ編集の基盤**：トランザクション管理によりYjsとの相性が良い。

|            | ProseMirror | Tiptap                                        |
| ---------- | ----------- | --------------------------------------------- |
| 立ち位置   | エンジン    | ラッパー                                      |
| 学習コスト | 高い        | 低〜中                                        |
| 自由度     | 最高        | 高い（必要時にProseMirrorへ降りることも可能） |

---

### pg_bigmとは

PostgreSQL本体には日本語全文検索機能が用意されていないため、その代替として開発された拡張モジュール。2-gram（バイグラム）という手法で文字列からGINインデックスを作成し、高速な日本語検索を実現する。

**Bigramの仕組み**

```
「東京都新宿区」を Bigram で分割すると：
→ "東京" "京都" "都新" "新宿" "宿区"

検索ワード「新宿」→ "新宿" がインデックスに存在 → ヒット ✅
```

**pg_trgm との比較**

|            | pg_trgm    | pg_bigm          |
| ---------- | ---------- | ---------------- |
| 分割単位   | 3文字      | 2文字            |
| 日本語対応 | ✕ 弱い     | ◎ 強い           |
| 2文字検索  | ✕ 非対応   | ◎ 対応           |
| 標準付属   | ✅ contrib | 別途インストール |

**注意点**

- 英字の大文字・小文字は区別される（`lower()` で揃えて対応）
- 軽めの用途なら pg_bigm で十分。大規模集計には Elasticsearch が優れる
- Supabase（PostgreSQL）でも利用可能

---

### Yjsとは

複数人が同時に同じドキュメントを編集しても内容が壊れないようにするためのライブラリ。共同編集の核となるエンジン。

**Yjsの解決方法：CRDT**

CRDT（Conflict-free Replicated Data Type）という仕組みを使い、「どんな順序で操作が届いても最終的に全員が同じ状態になる」ことを数学的に保証する。

```
ユーザーAの操作：末尾に「メモ」を追加
ユーザーBの操作：「今日」を「本日」に変更

Yjs がマージ → 全員の画面が「本日の会議メモ」で一致 ✅
```

**Tiptapとの関係**

```
Tiptap（エディタ）
　└── @tiptap/extension-collaboration
　　　　└── Yjs（CRDTエンジン）
　　　　　　　└── Supabase Realtime（同期トランスポート）
```

> ※ Phase 4 のスコープ縮小（共有リンクのみ）により、現時点では Yjs の実装は不要。将来的に共同編集を追加する場合の参考として記録。

---

### Cloud Run × WebSocket の問題点（参考）

Cloud Run はリクエスト単位で処理するサーバーレス基盤のため、WebSocket の長時間接続との相性が悪い。

| 問題                         | 内容                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------- |
| スケールアウト時の接続分散   | インスタンスが増えると同じメモの接続が別インスタンスに振られ Yjs の同期が壊れる |
| アイドルタイムアウト         | リクエストがない時間が続くとインスタンスがスケールダウンし接続が切れる          |
| セッションアフィニティの限界 | スティッキーセッションで回避できるが、インスタンス障害時に接続が全断する        |
| コールドスタート             | スケールゼロからの起動遅延がリアルタイム性を損なう                              |

共同編集が必要になった場合の代替案：Supabase Realtime（追加コストなし・既存スタックで完結）が最有力。

---

## 9. 議事録

### 2026-03-18

- プロジェクト概要と方向性を整理
- ロードマップ5フェーズを策定
- 技術スタック確認：React / Supabase / Cloud Run / Vercel
- エディタライブラリ比較（Tiptap / Quill.js / Slate.js / Lexical）→ Tiptap採用決定
- 競合分析（Notion / Obsidian / Bear）→ 差別化戦略を策定
- Phase 1（Tiptap導入）の実装方針を詳細化
- Phase 2（情報整理）のDBスキーマ設計を詳細化
- Phase 3（AI連携）のアーキテクチャを詳細化
- Phase 4（コラボ・共有）→ 共有リンクのみに縮小
- Phase 5（データインポート）を追加（Step 1〜3）
- Cloud Run × WebSocket の問題点を整理（共同編集が必要になった場合は Supabase Realtime を採用）
- 全体スケジュールを整理（Phase 1〜4 最短4ヶ月、Phase 5 含め最長5.5ヶ月）

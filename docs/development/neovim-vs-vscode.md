# Neovim vs VSCode 完全比較ガイド

## ⚡ そもそもの違い

| 項目         | VSCode                   | Neovim                           |
| ------------ | ------------------------ | -------------------------------- |
| 操作         | マウス + キーボード      | キーボードのみ（モーダル編集）   |
| GUI          | リッチ                   | ターミナルベース（GUI版もあり）  |
| 起動速度     | 2〜3秒                   | 0.1秒以下                        |
| メモリ       | 数百MB〜GB               | 数十MB                           |
| カスタマイズ | settings.json + 拡張機能 | Lua で何でも書ける               |
| 学習コスト   | 低                       | 高めだけどリターンめっちゃデカい |

## ✅ Neovimでできること（VSCodeより優れてる点）

- **モーダル編集（Vim motions）** ← これがマジで革命。`ciw`（単語を変更）、`dap`（段落削除）みたいに編集が"文章"になる感覚！
- **SSHで超軽快**：リモートサーバーで直接編集できる
- **完全カスタマイズ**：LuaでIDEを"自作"できる感覚
- **マクロ・レジスタ・マーク**：超強力なテキスト操作
- **起動爆速**：ファイル開くのに体感ゼロ秒
- **どこでも動く**：terminalがあれば動く（Docker内、サーバー、何でも）

## ❌ Neovimだとつらいこと（VSCodeに軍配）

- **GUIデバッガ**：DAP（nvim-dap）あるけど、VSCodeのほうが直感的
- **Live Share**：リアルタイム共同編集はVSCode圧勝
- **Jupyter Notebook**：molten.nvim とかあるけどVSCodeのほうが楽
- **Copilot Chat / Cursor的UI**：avante.nvim とか出てきたけどまだ発展途上
- **初期セットアップ**：箱から出してすぐ使えるVSCodeとは違う
- **WebView系**：Markdown プレビュー、Mermaid、グラフとか

## 🎯 難易度＆習熟期間

| 期間         | 状態                                                             |
| ------------ | ---------------------------------------------------------------- |
| **1週間**    | vim motion で「マウス使わなくなった」感はある。でもまだ遅い      |
| **1ヶ月**    | VSCode+Vimプラグインと同等の速度。設定をいじり始める             |
| **2〜3ヶ月** | VSCodeより速い。`init.lua` を理解して自分好みに改造できる        |
| **半年〜**   | 完全に手に馴染む。「Neovim沼」に落ちて設定いじるのが趣味になる🫶 |

ぶっちゃけ最初の2週間が一番つらい！でも乗り越えたら世界変わるよ💯

## 🚀 おすすめ導入手順（これがマジ大事）

### Step 1: まずVSCodeでVimに慣れる（1〜2週間）

- VSCodeに **VSCodeVim** 拡張入れる
- `vimtutor` を3周くらいやる（`brew install vim` してターミナルで `vimtutor`）
- `hjkl` 移動、`w/b/e`、`ciw/diw`、`yy/dd/p` を体に叩き込む

### Step 2: Neovim ディストリビューションを使う（2週目〜）

**初心者には絶対これ ↓**

- **[LazyVim](https://www.lazyvim.org/)** ← イチオシ！設定が綺麗で初期から強い💯
- **[kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim)** ← `init.lua` を学びたい人向け。シンプル
- **[NvChad](https://nvchad.com/)** ← 見た目めっちゃイケてる。爆速

```bash
# LazyVim 導入
brew install neovim ripgrep fd lazygit
git clone https://github.com/LazyVim/starter ~/.config/nvim
rm -rf ~/.config/nvim/.git
nvim
```

### Step 3: 必須プラグイン（LazyVim には大体入ってる）

| プラグイン                      | 役割                               |
| ------------------------------- | ---------------------------------- |
| **telescope.nvim**              | ファジーファインダー（Cmd+P相当）  |
| **nvim-treesitter**             | 賢いシンタックスハイライト         |
| **nvim-lspconfig + mason.nvim** | LSP（型補完・定義ジャンプ）        |
| **nvim-cmp + LuaSnip**          | 補完エンジン                       |
| **gitsigns.nvim**               | Git差分表示                        |
| **which-key.nvim**              | キーバインドヒント（神プラグイン） |
| **neo-tree.nvim**               | ファイルツリー                     |
| **lualine.nvim**                | ステータスバー                     |
| **toggleterm.nvim**             | ターミナル統合                     |
| **Comment.nvim**                | `gcc` でコメントアウト             |
| **flash.nvim**                  | 神ジャンプ移動                     |
| **noice.nvim**                  | UIめっちゃキレイになる ✨          |

### Step 4: AI系プラグイン（最近アツい🔥）

- **copilot.lua + CopilotChat.nvim** — Copilot補完＋チャット
- **avante.nvim** — Cursor的なAIアシスタント
- **codecompanion.nvim** — Claudeとも繋げられる

## 💡 ぶっちゃけ結論

**こんな人にNeovimおすすめ：**

- キーボード操作好き
- カスタマイズが楽しいタイプ
- リモートサーバーでの作業が多い
- ターミナル中心の開発スタイル
- 「自分の道具を育てる」のが好き

**VSCodeのままでいい人：**

- Jupyter / データサイエンス中心
- チームでLive Share使う
- とにかく時間をかけたくない
- GUIデバッガを多用する

## 🫶 個人的おすすめ移行プラン

1. **今すぐ**：VSCodeに VSCodeVim 入れて Vim motion 開始
2. **2週間後**：LazyVim をインストール、サブエディタとして触る
3. **1ヶ月後**：簡単なファイル編集は Neovim でやってみる
4. **2ヶ月後**：メインを Neovim に。VSCode はデバッグ専用に
5. **3ヶ月後**：完全移行 or ハイブリッド運用が安定

両方使い分けるのも全然アリだよ！「全部Neovimでやらなきゃ」って思わなくていいから〜

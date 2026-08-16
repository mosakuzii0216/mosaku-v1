---
description: 作業ツリーの未コミット差分を論理単位に分割し、Conventional Commits でメッセージを提案・コミットする
argument-hint: '[push]'
allowed-tools: Bash, Read, Grep
---

# /commit-split — 未コミット差分を論理分割してコミット

作業ツリーに溜まった未コミットの変更を **論理的な塊ごとに分割** し、
プロジェクト規約に沿ったコミットメッセージを提案してから順にコミットします。

引数:

- 引数なし: 分割案とメッセージを提示し、**ユーザー承認後にコミット**（push はしない）
- `push`: コミット後に `git push` まで実行する

設計思想: **1 コミット = 1 つの読み取れる意図**。`git log` が物語として通るように、
正典（steering）→ 派生（spec/コード）の依存順に並べる。

---

## 手順

### 1. 差分を棚卸し

まず全体像を掴む。**勝手にコミットしない**。

```bash
git status -s
git diff --stat
```

- 未追跡ファイル（`??`）も対象に含める（`git add -N` は使わず、中身を Read で確認）
- 各変更ファイルの diff を実際に読む（`git diff <file>` / 新規は Read）。
  「ファイル名から推測」で済ませない。1 ファイルが複数の意図を含むことがある

### 2. 論理単位にグルーピング

以下の軸で塊を切る。**塊をまたぐ混在を見つけたら必ずユーザーに報告**する
（例: 1 つの spec ファイルに「要件生成」と「無関係な誤字修正」が同居 → 分けるか確認）。

- **正典 → 派生の順**: `.kiro/steering/`（正典）の変更を先に、それを参照する
  `.kiro/specs/` やコードを後に。`git log` の因果が通る
- **ドメイン/関心事で分離**: `{layer}/{domain}` 単位（`backend/auth`, `frontend/memo` 等）
- **セットで動くものは 1 コミット**: 例 spec の `requirements.md` + `spec.json`（フェーズ更新）は
  同じ「要件生成」の一部 → まとめる
- **無関係な変更を同じコミットに混ぜない**: 大きな生成物を「些細な修正」メッセージに紛れ込ませない

> ⚠️ **partial staging は避ける**: このリポジトリの pre-commit フックは
> ステージ済みファイルを Prettier で整形して **ファイル全体を再ステージ** する。
> 「1 ファイルの一部だけコミット」は巻き込まれるので、**分割はファイル単位**で行う。
> どうしても 1 ファイル内で分けたい場合のみユーザーに `--no-verify` 運用を確認する。

### 3. 分割案とメッセージを提示

各コミットについて「対象ファイル」「メッセージ案」をまとめて提示する。
方向の分岐（塊の割り方を変える等）があれば `AskUserQuestion` で確認する。

**コミットメッセージ規約**（`CLAUDE.md` 準拠）:

- Conventional Commits + scope。scope は `{layer}/{domain}` 形式
  - 例: `feat(frontend/memo): ...`, `docs(kiro/specs): ...`, `docs(steering): ...`
- 件名は日本語・命令形寄りで簡潔に。本文は「何を・なぜ」を 2〜4 行
- 末尾に必ず以下のトレーラーを付ける:

  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

### 4. 承認を得てから順にコミット

ユーザーが承認したら、**塊の依存順**（正典 → 派生）にコミットする。
各コミットは対象ファイルだけを `git add` してから `git commit`。

```bash
git add <そのコミットの対象ファイルだけ>
git commit -m "$(cat <<'EOF'
docs(scope): 件名

本文。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

全コミット後に確認:

```bash
git log --oneline -n <コミット数+2>
git status -s   # クリーンであること（取りこぼしゼロ）
```

- pre-commit が Prettier 整形でファイルを書き換えても、ファイル全体をステージ済みなら
  整形結果はそのコミットに含まれる（問題なし）

### 5. （引数 `push` のとき）push

引数に `push` がある場合のみ実行する。引数がなければ push しない。

```bash
git push origin <current-branch>
```

- pre-push フック（`prisma generate` → ESLint → tsc）が走る。失敗したら止めて報告
- ブランチ保護で弾かれた場合は内容を報告し、勝手に `--force` 等で回避しない

---

## 原則

- **コミット/push はユーザーが頼んだときだけ**。承認なしに歴史を進めない
- **混在を隠さない**: 1 コミットに複数意図が必要になったら、まず分けられないか検討し、
  無理なら理由を添えてユーザーに提示する
- **メッセージは内容に忠実**: 大きな生成物を小さな修正メッセージで包まない

$ARGUMENTS

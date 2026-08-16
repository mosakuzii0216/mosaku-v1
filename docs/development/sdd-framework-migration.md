# SDD フレームワーク移行（cc-sdd → OpenSpec + Superpowers）

決定日: 2026-08-12
前回調査: `docs/development/sdd-oss-research.md`（2026-03-17）

---

## 結論

**SDD という思想は維持する。フレームワークだけ乗り換える。**

| レイヤー         | 旧                       | 新                                                   |
| ---------------- | ------------------------ | ---------------------------------------------------- |
| 仕様             | cc-sdd（`.kiro/specs/`） | **OpenSpec**（`openspec/changes/`）                  |
| 実装規律         | cc-sdd の TDD 指示       | **Superpowers**（TDD / YAGNI / DRY / subagent 駆動） |
| プロジェクト記憶 | `.kiro/steering/`        | **`.kiro/steering/`（継続）**                        |

---

## 判断根拠 1: cc-sdd は主流ではなかった

2026-08-12 時点の GitHub 実データ。

| フレームワーク               | Stars     | 最終 push      | 状態                                             |
| ---------------------------- | --------- | -------------- | ------------------------------------------------ |
| **gotalab/cc-sdd**（旧採用） | **3,616** | **2026-05-20** | 約 3 ヶ月停滞                                    |
| obra/superpowers             | 271,031   | 2026-08-12     | 活発・**Anthropic 公式プラグインマーケット収録** |
| github/spec-kit              | 126,351   | 2026-08-11     | 活発（重量級・チーム向け）                       |
| Fission-AI/OpenSpec          | 64,633    | 2026-08-12     | 活発                                             |
| bmad-code-org/BMAD-METHOD    | 51,801    | 2026-08-11     | 活発（重量級・マルチエージェント）               |

2026-03 の調査時点では「AWS・GitHub・Microsoft が同一構造に収束」という読みで cc-sdd を選んだ。
**その読み自体は今も正しい**（`requirements` / `design` / `tasks` 構造は業界標準として定着）。
誤っていたのは**その構造の実装として cc-sdd を選んだこと**。規模で 15〜75 倍の差がつき、更新も止まった。

---

## 判断根拠 2: 全変更に同じ重さを課す硬直性

旧 `CLAUDE.md` の規定:

> **全ての機能追加・修正は仕様定義 → 承認 → 実装の順で進めること。承認なしに実装しない。**

この「全ての」が週 5 時間の開発予算に対して重すぎた。

### 自リポジトリの実測（2026-08-12）

|                               | 行数                      |
| ----------------------------- | ------------------------- |
| 仕様書（`.kiro/specs` 41 本） | 37,164（1 本平均 906 行） |
| ステアリング                  | 1,285                     |
| 実装コード                    | 27,686                    |
| テストコード                  | 40,075                    |

- **仕様 ÷ 実装 = 1.34**
- 仕様 ÷（実装 + テスト）= 0.55

> 参考: Spec Kit の批評記事（Scott Logic）では **仕様 2,577 行 : 実装 689 行 = 3.74** で「反復プロンプトの方が 10 倍速い」と結論づけられた。
> **本プロジェクトの 1.34 はそれよりはるかに健全**であり、「cc-sdd が重すぎて破綻した」という事実はない。テストが実装の 1.45 倍あり、品質投資も適切だった。

### では何が問題だったのか

**ビルドループは優秀だった。ラーンループが存在しなかった。**

41 本の spec を回し、4 万行のテストを積み、`implementation-validated` まで到達させた。プロセスとしては機能していた。
しかしその全量が「実ユーザーのリクエストが 2 日で 3 件」という状態に注がれ続けた（`docs/development/plan-docs-audit-2026-08.md` 参照）。

cc-sdd が最適化するのは「**正しく作る**」ループであり、「**作るべきか**」を確かめるループを持たない。
OpenSpec の `/opsx:explore`（何を作るか決まっていない段階の壁打ち）は、この欠落に直接対応する。

---

## 選定理由

### OpenSpec を仕様レイヤーに選んだ理由

公称する設計思想が、SDD への主要な批判にそのまま対応している。

```
→ fluid not rigid        （硬直への批判に対応）
→ iterative not waterfall（ウォーターフォール回帰批判に対応）
→ easy not complex
→ built for brownfield not just greenfield（既存コードベース前提）
→ scalable from personal projects to enterprises（個人開発でも過剰にならない）
```

- 生成物が `proposal.md` / `specs/` / `design.md` / `tasks.md` で、**旧 `.kiro/specs/` とほぼ同構造**。認知的な移行コストが低い
- `/opsx:explore` という探索フェーズを持つ（cc-sdd には無かった）
- **PdM 素養を磨く目的に対して、仕様ドキュメントという成果物が残る**（`project_mosaku_purpose_and_success` の目的 1）

### Superpowers を実装規律に選んだ理由

- Anthropic 公式プラグインマーケット収録（`/plugin install superpowers@claude-plugins-official`）
- スキルが自動発火するため、コマンドを覚える必要がない
- 真の RED/GREEN TDD・YAGNI・DRY を強制し、subagent 駆動で自律実装する
- 仕様レイヤーとは役割が重ならないため OpenSpec と併用できる

### 採用しなかったもの

|                         | 理由                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| GitHub Spec Kit（126k） | 最大手だが重量級でチーム向け。批評記事の「仕様 3.74 倍」問題の当事者。ソロ・週 5 時間には過剰 |
| BMAD-METHOD（51k）      | 21 エージェント・50 ワークフローの重厚設計。構想から本番運用まで covers するがソロには過剰    |
| Superpowers 単独        | 最速だが**永続する仕様ドキュメントが残りにくい**。PdM 練習の成果物が減るため不採用            |

---

## 移行の実務

### 移行コストは低い

41 本の spec のうち、移行時点で**進行中は 2 本のみ**。残り 39 本は `completed` / `implementation-validated` であり、単なる履歴。**変換不要**。

| spec                          | 移行時の状態                                | 扱い                                      |
| ----------------------------- | ------------------------------------------- | ----------------------------------------- |
| `editor-surface-tokenization` | `tasks-generated`（実装進行中）             | **cc-sdd のまま完了させる**（中断しない） |
| `north-star-metrics`          | `initialized`（当日作成・中身は説明文のみ） | **OpenSpec で作り直す**（投資ゼロのため） |
| 上記以外 39 本                | completed / validated                       | `.kiro/specs/` に凍結保持                 |

### `.kiro/steering/` は継続

OpenSpec に steering 相当の「プロジェクト記憶」機能が無いため、`product.md` / `tech.md` / `structure.md` / `dogfooding.md` / `quality.md` はそのまま維持する。`/kiro:steering` コマンドも残す。

### north-star-metrics の再作成コマンド

```
/opsx:propose 北極星指標 W3W（Weekly 3-day Writers = その週に3日以上メモを書いたユーザー数）を継続的に計測・可視化する基盤。既存スキーマ（Memo.userId / createdAt / updatedAt）だけで算出でき、追加のトラッキング実装は不要。週次で W3W 本体に加え、支持指標（登録7日以内に3日以上書いた人の割合＝Activation率、登録4週目にW3Wだった人の割合＝W4 Retention、W3Wユーザーの週間執筆日数の中央値）と、劣化監視のカウンター指標を算出する。「書いた日」の定義は JST 0時区切りで日単位に DISTINCT で丸め、ゴミ箱送り（trashedAt が非NULL）のメモも執筆日としてカウントする。ノートブック編集は含めない。用途は docs/progress.md の週次エントリへの記載と、段階目標（Phase A/B/C）の到達判定。設計根拠と却下した指標候補は docs/development/north-star-metric.md に記載済み。ADMIN 向け表示か週次バッチ通知かは design で判断する。
```

---

## 未決

1. **変更の大きさに応じたフローの段階分け**を導入するか。案:

   | 段階   | 対象                                      | プロセス                                 |
   | ------ | ----------------------------------------- | ---------------------------------------- |
   | Full   | 新しいユーザー価値・DB スキーマ変更・課金 | `/opsx:explore` → `propose` → `apply`    |
   | Light  | 既存機能の改善・UX 修正                   | `/opsx:propose` から開始（explore 省略） |
   | Direct | バグ修正・文言・リファクタ・依存更新      | spec なし。plan mode で確認して直接実装  |

   > 根拠となる実例: 2026-08-12 の Cloud Run `min-instances` 変更は「測る → 承認 → 適用 → 検証」で 15 分だった。フル SDD を通していれば数日かかっていた。

2. **OpenSpec のテレメトリ**。既定で匿名の利用統計を送信する。無効化する場合:

   ```bash
   npx @fission-ai/openspec config set telemetry.enabled false
   # または環境変数 OPENSPEC_TELEMETRY=0
   ```

3. `docs/project-plan-2026.md` 内の cc-sdd ワークフロー記述の更新（未着手）

---

## 出典

- [Putting Spec Kit Through Its Paces: Radical Idea or Reinvented Waterfall? — Scott Logic](https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html)
- [obra/superpowers](https://github.com/obra/superpowers)
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- [github/spec-kit](https://github.com/github/spec-kit)
- [gotalab/cc-sdd](https://github.com/gotalab/cc-sdd)

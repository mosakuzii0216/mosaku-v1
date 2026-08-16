# 仕様駆動開発（SDD）に活用できるOSS 調査メモ

> 調査日: 2026-03-17

## 背景・目的

仕様駆動開発（Spec-Driven Development）の導入・強化にあたり、活用できるOSSを調査した。
AWS・GitHub・Microsoftが同時期に同じ仕様ファイル構造（`requirements.md` / `design.md` / `tasks.md`）を採用しており、業界全体でSDDへの収束が進んでいる。

---

## カテゴリ別OSS一覧

### 1. AI統合型SDDフレームワーク

#### GitHub Spec Kit ⭐ 注目

- **リポジトリ**: https://github.com/github/spec-kit
- **ライセンス**: MIT
- **概要**: GitHubが公式にオープンソース化したSDDツールキット。CLI + テンプレート + プロンプト集で構成され、`specify → plan → tasks → implement` の4フェーズゲートプロセスを採用。
- **特徴**:
  - Claude Code を含む22以上のAIエージェントに対応
  - slash コマンドベースでワークフローを定義
  - IBM が IaC 向け派生版を作成するほど拡張性が高い
- **このプロジェクトへの適用**: `.claude/commands/` に取り込める構造。現行 `add-feature.md` スキルと思想が共通しており、参考実装として価値大。

---

#### BMAD-METHOD

- **リポジトリ**: https://github.com/bmad-code-org/BMAD-METHOD
- **概要**: "Breakthrough Method for Agile AI Driven Development" の略。21の専門エージェント・50以上のガイドワークフローを持つマルチエージェント型SDDフレームワーク。
- **対応IDE**: Claude Code、Cursor、Windsurf、VS Code
- **特徴**: Kiro や Spec Kit が仕様→コードのワークフローに特化するのに対し、BMAD は構想から本番運用まで全フェーズをカバーする重厚な設計。
- **このプロジェクトへの適用**: 導入コストは高いが、エンタープライズ規模の開発フローの参考として有用。

---

#### OpenSpec

- **リポジトリ**: https://github.com/Fission-AI/OpenSpec
- **概要**: AIコーディングアシスタント向けの軽量スペックレイヤー。コード生成前に「何を作るか」の仕様合意を担う。
- **特徴**: 既存ツール（Cursor、Claude Code等）に追加するオーバーレイとして機能。軽量で導入しやすい。
- **このプロジェクトへの適用**: 現行の steering ファイルシステムの補完として活用可能。

---

#### Kiro（AWS）※ IDE本体は非OSS

- **サイト**: https://kiro.dev/
- **概要**: AWSが2025年7月にリリースしたSpec-first AIエージェントIDE。VS Code フォーク + Amazon Bedrock（Claude Sonnet）。
- **仕様ファイル構造**:
  - `requirements.md`（EARS構文）
  - `design.md`
  - `tasks.md`
- **参照価値**: このプロジェクトの `.kiro/specs/` と構造が同一。SDD設計の参考として重要。CLIはACP準拠でオープン。

---

### 2. スキーマ駆動開発（API First）

#### Orval ⭐ 優先導入候補

- **リポジトリ**: https://github.com/orval-labs/orval
- **概要**: OpenAPI v3 / Swagger v2 仕様から TypeScript の型安全なクライアントを生成。React Query・SWR・Vue・Svelte など多数のフレームワーク向けフックを自動生成。
- **NestJS連携**: `@nestjs/swagger` が出力する OpenAPI ドキュメントをそのまま入力に使用可能。
- **このプロジェクトへの適用**:
  ```
  NestJS（@nestjs/swagger）→ OpenAPI出力 → Orval → React Queryフック自動生成
  ```
  `useMemoQueries` などの手書きAPIフックを自動生成に置き換えることで、仕様とコードの乖離をそもそも発生させない仕組みを構築できる。

---

#### nestjs/swagger

- **リポジトリ**: https://github.com/nestjs/swagger
- **概要**: NestJS公式のOpenAPI（Swagger）モジュール。デコレータでAPI仕様を定義し、Swagger UIとOpenAPIドキュメントを自動生成。
- **このプロジェクトへの適用**: Orval と組み合わせることでフロントエンド型生成の基盤となる。

---

#### TypeSpec（Microsoft）

- **リポジトリ**: https://github.com/microsoft/typespec
- **概要**: TypeScriptにインスパイアされたAPI記述言語。OpenAPI・JSON Schema・Protobufを同時出力可能。TypeSpec 1.0 GA済み。
- **特徴**: Azure サービスのAPI定義に採用。TypeScriptと親和性が高いシンタックス。
- **このプロジェクトへの適用**: 将来的な移行候補。現時点は NestJS Swagger デコレータとの二重管理が発生するリスクあり。

---

#### OpenAPI Generator

- **リポジトリ**: https://github.com/OpenAPITools/openapi-generator
- **スター数**: 2万以上（最も普及した OSS API ジェネレーター）
- **概要**: OpenAPI Spec v2/v3 からクライアントSDK・サーバースタブ・ドキュメントを自動生成。多言語対応。
- **このプロジェクトへの適用**: Orval より汎用的。複数言語への展開が必要な場合に有利。React/TypeScript特化では Orval が実用的。

---

### 3. BDD（振る舞い駆動開発）・テスト

#### jest-cucumber

- **リポジトリ**: https://github.com/bencompton/jest-cucumber
- **概要**: Gherkin形式（Given/When/Then）のシナリオをJestで実行。ユニットテストとBDDテストを統一。
- **このプロジェクトへの適用**: バックエンド（NestJS）のAPIのBDD仕様テストに有効。仕様書の受け入れ条件を `.feature` ファイルとして管理し、仕様と実行可能テストを同期させるパターンに使用できる。

---

#### playwright-bdd

- **リポジトリ**: https://github.com/vitalets/playwright-bdd
- **概要**: Playwright + Gherkin。E2EテストにBDD構文を適用。
- **このプロジェクトへの適用**: フロントエンドのE2EテストをBDD化するのに有効。

---

#### Cucumber.js

- **リポジトリ**: https://github.com/cucumber/cucumber-js
- **概要**: Gherkin形式のシナリオをJSで実行するBDDフレームワークの標準実装。
- **このプロジェクトへの適用**: jest-cucumber の代替。Cucumberエコシステムをフルに使いたい場合に選択。

---

### 4. コントラクトテスト

#### Pact / pact-js ⭐ 優先導入候補

- **リポジトリ**: https://github.com/pact-foundation/pact-js
- **NestJS連携**: https://github.com/pact-foundation/nestjs-pact（公式モジュール）
- **参考ワークショップ**: https://github.com/DiUS/pactflow_nest_react_workshop
- **概要**: コンシューマー駆動コントラクトテストのデファクトスタンダード。フロントエンド（React）がコンシューマー、バックエンド（NestJS）がプロバイダーとして、APIの契約を自動検証。
- **このプロジェクトへの適用**: React↔NestJS間のAPI仕様の乖離をCIで検出できる。マルチテナント構成の変更影響を安全に検証可能。

---

### 5. コンポーネント仕様・ドキュメント管理

#### Storybook（v10）

- **サイト**: https://storybook.js.org/
- **概要**: UIコンポーネントの仕様をStoriesとして記述し、開発・テスト・ドキュメントを統合。v10でCSF Factories（TypeScript-first）を採用。
- **特徴**: `play` 関数でインタラクションテストが実行可能。`@storybook/test`（Vitestベース）でテスト統合が強化。
- **このプロジェクトへの適用**: フロントエンドのコンポーネント仕様管理として有効。テーマシステムの視覚的仕様確認にも使用可能。

---

## 優先度まとめ

| 優先度   | ツール                        | 用途                                         | 導入コスト |
| -------- | ----------------------------- | -------------------------------------------- | ---------- |
| **最高** | Orval + nestjs/swagger        | OpenAPI → フロント型生成パイプライン         | 低         |
| **最高** | Pact（pact-js + nestjs-pact） | フロント↔バックエンドのコントラクトテスト   | 中         |
| **高**   | GitHub Spec Kit               | SDDワークフローの標準化（Claude Code連携）   | 低         |
| **高**   | jest-cucumber                 | バックエンドAPIのBDD仕様テスト               | 中         |
| **中**   | playwright-bdd                | E2EテストのBDD化                             | 中         |
| **中**   | Storybook                     | コンポーネント仕様・テーマシステムの視覚管理 | 中         |
| **参考** | Kiro                          | SDD設計の参考（`.kiro/specs/` の思想共有）   | N/A        |
| **参考** | TypeSpec                      | API-first設計の将来的移行先候補              | 高         |
| **参考** | BMAD-METHOD                   | 大規模エージェントワークフローの参考         | 高         |

---

## 所感・検討ポイント

### 業界トレンドとの整合性

AWS・GitHub・Microsoftが揃って `requirements.md` / `design.md` / `tasks.md` という同一構造を採用している。現プロジェクトの `.kiro/specs/` および `.steering/` の方針は業界標準に完全に沿っている。

### 短期で実利を得やすい組み合わせ

**Orval + nestjs/swagger** が最も費用対効果が高い。
手書きのAPIフック（`useMemoQueries` 等）を自動生成に置き換えることで、仕様（OpenAPI）とコードの乖離をそもそも発生させない仕組みを作れる。

### 中期で検討したいアーキテクチャ

```
OpenAPI仕様（単一ソース）
      ↓
nestjs/swagger（バックエンドのデコレータから自動生成）
      ↓
Orval（フロントエンド型・React Queryフック自動生成）
      ↓
Pact（フロント↔バックエンドのコントラクトテストで仕様乖離をCI検出）
```

この構成で「仕様→実装→検証」のループを自動化できる。

---

## ブレインストーミングメモ（2026-03-17）

### 出発点となった課題感

調査資料をベースに検討を進めた結果、以下の2つの課題が本質として浮かび上がった。

1. **テストがないからリファクタに自信が持てない**
2. **Claudeに任せすぎて「作った感」がない**

### 議論の流れ

- 現状、UIデザイン・実装・テーマ作成まで全てClaude任せになっている
- 「自分でやりたい」領域として **UIデザイン** と **機能設計** が挙がった
- BDDの考え方（`.feature` ファイルを日本語で書く）を紹介したところ興味を持ってもらえた
- テストの入口として **バックエンドAPIテスト（メモCRUD）** から始めることで合意

### 見えてきた方向性

**jest-cucumber** を使ったBDDテスト導入が最初のステップとして有力。

| 誰が              | 何をやる                                |
| ----------------- | --------------------------------------- |
| **自分**          | `.feature` ファイルに仕様を日本語で書く |
| **Claude**        | step definitionsとNestJSの実装を担当    |
| **jest-cucumber** | 書いた仕様がちゃんと動くか自動検証する  |

**なぜこれか：**

- `.feature` ファイルはコードではなく「仕様の日本語記述」なので、自分で書ける
- 仕様を自分で書く = 「自分が設計したものを作ってもらった」感覚になる
- テストが整備されることでリファクタへの不安も同時に解消される
- NestJSに既存のJestセットアップがあるため導入コストが低い

**最初に対象とするAPI：**

- メモのCRUD（作成・編集・削除）
- 権限チェック（他人のメモは操作できない）

### `.feature` ファイルのイメージ

```gherkin
機能: メモ管理

  シナリオ: メモを新規作成する
    前提 ユーザーがログイン済みである
    もし タイトル「今日のメモ」で作成リクエストを送る
    ならば ステータス201が返る
    かつ 作成したメモが一覧に含まれる

  シナリオ: 他人のメモは編集できない
    前提 別のユーザーのメモが存在する
    もし そのメモに編集リクエストを送る
    ならば ステータス403が返る
```

### 優先度の更新

上記の議論を踏まえ、**jest-cucumber を最優先**に引き上げる。

| 優先度     | ツール                 | 理由                                                            |
| ---------- | ---------------------- | --------------------------------------------------------------- |
| **最優先** | jest-cucumber          | 課題2つを同時に解決。自分で仕様を書ける = 作った感 + テスト整備 |
| **次点**   | Orval + nestjs/swagger | APIフック自動生成。仕様乖離を防ぐインフラ整備                   |
| **中期**   | Pact                   | フロント↔バック間のコントラクトテスト                          |

### 次のステップ

`/kiro:spec-init` でjest-cucumber導入のspecを作成し、メモCRUDのBDDテストを実装する。

---

## 追加検討（2026-03-17）

### TDDとSDDを同時に進める方法

**二重ループTDD（Double Loop TDD）** として整理できる。

```
【外側ループ: BDD/受け入れテスト】
.feature ファイルを書く（RED）
        ↓
  【内側ループ: ユニットTDD】
  ユニットテストを書く（RED）
        ↓
  実装してユニットテストをパス（GREEN）
        ↓
  リファクタ
        ↑ ← この内側ループを繰り返す
        ↓
.feature テストもパスする（GREEN）
        ↓
コミット（1タスク = 1コミット）
```

外側のBDDテストが「何を作るか」を決め、内側のユニットテストが「どう作るか」を駆動する。

#### `/kiro:spec-impl` との統合

```
/kiro:spec-impl（タスク番号）

  RED   → .feature を書く + step definitions の骨格
  RED   → ユニットテストを書く
  GREEN → 実装
  REFACTOR
  GREEN → BDDテストも通る
  → コミット
```

#### 役割分担

| 誰が                     | 何をやる                                     |
| ------------------------ | -------------------------------------------- |
| **自分**                 | `.feature` ファイルに日本語でシナリオを書く  |
| **Claude**               | step definitions・ユニットテスト・実装を担当 |
| **jest-cucumber + Jest** | 両方のループを自動検証                       |

---

### 現状確認（プロジェクトへの導入状況）

**入っているもの：**

- `jest` + `ts-jest`（バックエンドのユニットテストランナーのみ）
- cc-sddの成果物（`.kiro/settings/` のルール・テンプレート、`.kiro/steering/`、`.kiro/specs/`）

**入っていないもの（検討中のOSS）：**

| ツール         | 状態   |
| -------------- | ------ |
| jest-cucumber  | 未導入 |
| Orval          | 未導入 |
| nestjs/swagger | 未導入 |
| Pact           | 未導入 |
| Storybook      | 未導入 |

cc-sddはnpmパッケージとして常駐するものではなく、「実行すると `.kiro/` の設定・テンプレートを生成するCLI」。既に実行済みで、その出力がプロジェクトに組み込まれている。

---

### cc-sdd と検討中OSSの違い（レイヤーの整理）

**cc-sdd：開発プロセスのフレームワーク**（何をどの順番で作るかを管理）
**検討中OSS：技術的な実装ツール**（どうやって作るかを支援）

```
cc-sdd（プロセス）
  └── tasks.md にタスクを定義
        ↓
  jest-cucumber（技術ツール）
    └── タスクをGherkinシナリオとして書いて実行可能にする
        ↓
  Orval（技術ツール）
    └── APIのコードを仕様から自動生成する
        ↓
  Pact（技術ツール）
    └── 仕様通りに動いているかCIで検証する
```

|                | cc-sdd                       | 検討中OSS                      |
| -------------- | ---------------------------- | ------------------------------ |
| **何をする**   | 開発の順序・承認フローを管理 | テスト・コード生成・検証を実行 |
| **入力**       | 人間の仕様記述               | コード・APIスキーマ            |
| **出力**       | `requirements.md` 等の仕様書 | テスト結果・生成コード         |
| **対立するか** | しない                       | しない                         |

cc-sddが「設計図を書く工程」、検討中OSSが「設計図を使って建てる・検査する道具」。

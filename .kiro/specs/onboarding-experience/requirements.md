# Requirements Document

## Project Description (Input)

機能名: onboarding-experience（リッチ・オンボーディング体験）

目的: 6月末の友人10〜20人限定公開に向け、初回ログイン後の体験を「メモがありません＋作成ボタン」だけの空状態から、mosaku の差別化軸（15テーマ・ノートブック・リッチエディタ）が初回ユーザーに刺さるリッチな体験に引き上げる。

第一印象の優先順位（合意）: A「うわ綺麗！」(最優先・差別化軸) → B「お、すぐ書ける」 → C「機能いろいろあるじゃん」(最後・軽く)。

詳細なブレスト記録は [`brainstorm.md`](./brainstorm.md) を参照。

## Introduction

リッチ・オンボーディング体験は、初回ログインしたユーザーを「メモがありません」の空状態に放り出すのではなく、(A) 15テーマから世界観を選ぶ体験で第一印象を掴み、(B) 選んだテーマを着せた「ようこそノートブック」とお手本サンプルメモで迷わず書き始められるようにし、(C) その成果物自体がノートブック・エディタ機能の説明を兼ねる、という一連のフローを提供する。

テーマはノートブック単位で適用される既存設計（`useActiveTheme.ts`）に沿い（解釈1）、アプリ全体共通テーマの概念は新設しない。オンボーディングは初回のみ表示し、スキップ可能とする。本機能のシステム主体を「Onboarding Service」と呼ぶ。

## Requirements

### Requirement 1: 初回ログイン時のオンボーディング起動と完了管理

**Objective:** As a 新規ユーザー, I want 初回ログイン直後にオンボーディングが自動で始まり、二度目以降は出ないこと, so that 迷わず mosaku の世界観に入れて、その後は邪魔されずに使える

#### Acceptance Criteria

1. When ユーザーがオンボーディング未完了の状態でアプリのメイン画面に到達したとき, the Onboarding Service shall オンボーディングフローを自動的に開始する
2. While ユーザーがオンボーディングを完了済みの状態のとき, the Onboarding Service shall オンボーディングフローを表示しない
3. When ユーザーがオンボーディングを完了またはスキップしたとき, the Onboarding Service shall 完了状態を永続化する
4. When 完了状態が永続化されたユーザーが再ログインまたは再訪したとき, the Onboarding Service shall オンボーディングを再表示しない
5. The Onboarding Service shall オンボーディング表示中も既存の認証状態とログアウト操作を妨げない

### Requirement 2: テーマ選択ステップ（A-1）

**Objective:** As a 新規ユーザー, I want 最初に複数テーマから自分の世界観を選べること, so that mosaku のデザインの美しさを体感し、自分のスペースに愛着を持てる

#### Acceptance Criteria

1. When オンボーディングが開始したとき, the Onboarding Service shall 選択可能な全テーマをギャラリー形式で一覧表示する
2. When ユーザーがギャラリー上のテーマを選択したとき, the Onboarding Service shall 選択されたテーマの見た目をプレビューとして反映する
3. The Onboarding Service shall ギャラリー初期表示時にどのテーマも確定選択されていない状態で開始する
4. If ユーザーがテーマを選択せずに次へ進もうとしたとき, then the Onboarding Service shall テーマ選択を促し、ステップを進めない
5. The Onboarding Service shall テーマ選択ステップ内にスキップ動線（「あとで」）を控えめに（主要導線より目立たない形で）表示する
6. The Onboarding Service shall テーマギャラリーをモバイル画面幅でも操作可能なレイアウトで表示する
7. While ユーザーが `prefers-reduced-motion` を有効にしているとき, the Onboarding Service shall テーマプレビューの装飾アニメーションを抑制する

### Requirement 3: スキップ挙動

**Objective:** As a すぐ使い始めたいユーザー, I want オンボーディングをスキップできること, so that 強制されずに本題に入れる

#### Acceptance Criteria

1. When ユーザーが「あとで」（スキップ）を選択したとき, the Onboarding Service shall オンボーディングを終了して通常のメイン画面へ遷移する
2. When ユーザーがスキップしたとき, the Onboarding Service shall ようこそノートブックおよびサンプルメモを作成しない
3. When ユーザーがスキップしたとき, the Onboarding Service shall 完了状態を永続化して次回以降に再表示しない

### Requirement 4: ようこそノートブックの自動作成（解釈1）

**Objective:** As a 新規ユーザー, I want 選んだテーマが適用されたノートブックが用意されること, so that 選んだ世界観を実際のコンテンツ上で味わえる

#### Acceptance Criteria

1. When ユーザーがテーマを選択してオンボーディングを進めたとき, the Onboarding Service shall 「ようこそ」ノートブックを1つ作成する
2. When ようこそノートブックを作成するとき, the Onboarding Service shall 選択されたテーマをそのノートブックに適用する
3. When オンボーディング完了直後にメイン画面へ遷移したとき, the Onboarding Service shall 作成したようこそノートブックを選択状態にし、選択テーマが反映された画面を表示する
4. The Onboarding Service shall ようこそノートブックを通常のノートブックと同様に編集・削除できる状態にする
5. The Onboarding Service shall ノートブックの作成・取得・テーマ適用を既存の apiClient 経由で行い、アプリ全体共通テーマの概念を新設しない

### Requirement 5: サンプルメモのシード（B-1 / C 吸収）

**Objective:** As a 新規ユーザー, I want お手本となるサンプルメモが用意されること, so that 何をどう書けばいいかイメージでき、エディタ機能も自然に学べる

#### Acceptance Criteria

1. When ようこそノートブックを作成したとき, the Onboarding Service shall そのノートブック内にサンプルメモを1〜2枚作成する
2. The Onboarding Service shall サンプルメモに見出し・チェックリスト・コードブロック・スラッシュコマンドの使用例を含める
3. The Onboarding Service shall サンプルメモに日常利用を想起させる実例コンテンツ（書き始めのイメージが湧く内容）を含める
4. The Onboarding Service shall サンプルメモを選択テーマが適用された状態で表示する
5. The Onboarding Service shall サンプルメモを通常のメモと同様に編集・削除できる状態にする

### Requirement 6: 重複作成の防止（冪等性）

**Objective:** As a ユーザー, I want オンボーディングが生成物を重複させないこと, so that ようこそノートブックやサンプルメモが何個もできて散らからない

#### Acceptance Criteria

1. While ユーザーが既にオンボーディングを完了している状態のとき, the Onboarding Service shall ようこそノートブックおよびサンプルメモを新たに作成しない
2. If オンボーディングのデータ作成処理が途中で中断され再試行されたとき, then the Onboarding Service shall ようこそノートブックおよびサンプルメモを重複して作成しない
3. While オンボーディングのデータ作成が進行中のとき, the Onboarding Service shall ローディング状態を表示し、完了/スキップ操作の重複実行を防ぐ

### Requirement 7: エラー処理とグレースフルデグレード

**Objective:** As a 新規ユーザー, I want オンボーディング中の不具合でアプリが使えなくならないこと, so that 失敗しても本題に入れる

#### Acceptance Criteria

1. If ようこそノートブックまたはサンプルメモの作成が失敗したとき, then the Onboarding Service shall ユーザーへエラーを通知しつつ、通常のメイン画面に到達できる状態にする
2. If 選択テーマの適用が失敗したとき, then the Onboarding Service shall 既定（テーマなし）の状態でノートブックを表示する
3. If オンボーディングの完了状態の永続化に失敗したとき, then the Onboarding Service shall アプリの利用を妨げず、次回起動時の再表示は許容する

### Requirement 8: アーキテクチャ不変則の遵守

**Objective:** As a 開発者, I want オンボーディング実装が既存アーキテクチャ不変則を守ること, so that サーバー状態の一貫性と保守性が保たれる

#### Acceptance Criteria

1. The Onboarding Service shall サーバー状態（ノートブック・メモ・テーマ）を React Query で管理し、これらのデータを Zustand に複製しない
2. The Onboarding Service shall オンボーディングのUI状態（現在ステップ・選択中テーマ・モーダル開閉）を Zustand で管理する
3. The Onboarding Service shall 全ての API コールを `apiClient`（`utils/api.ts`）経由で行い、直接 `fetch` を使用しない

# Requirements Document

## Introduction

メモのゴミ箱機能（Soft Delete）を追加する。ユーザーがメモを削除すると即座に完全削除するのではなく、ゴミ箱に移動する。ゴミ箱内のメモは一覧表示・復元・完全削除が可能で、一定期間（30日）経過後は自動的に完全削除される。

## Requirements

### 1. Soft Delete（ゴミ箱への移動）

**Objective:** As a ユーザー, I want メモを誤って削除しても復元できるようにしたい, so that 誤操作によるデータ損失を防げる

#### Acceptance Criteria

1.1. When ユーザーがメモの削除操作を実行する, the Mosaku shall そのメモをゴミ箱に移動し、通常のメモ一覧から除外する

1.2. When メモがゴミ箱に移動される, the Mosaku shall メモのタイトル・コンテンツ・タグ・ノートブック関連を保持する

1.3. When メモがゴミ箱に移動される, the Mosaku shall ゴミ箱移動日時を記録する

1.4. The Mosaku shall ゴミ箱内のメモを通常のメモ一覧取得・検索・編集の対象から除外する

---

### 2. ゴミ箱一覧表示

**Objective:** As a ユーザー, I want ゴミ箱内のメモを一覧で確認したい, so that 誤削除したメモを把握して必要に応じて復元できる

#### Acceptance Criteria

2.1. When ユーザーがゴミ箱を開く, the Mosaku shall 自分がゴミ箱に移動したメモの一覧を表示する

2.2. The Mosaku shall ゴミ箱一覧の各メモにタイトル・削除日時・自動削除までの残日数を表示する

2.3. The Mosaku shall ゴミ箱が空の場合、空状態のメッセージを表示する

2.4. The Mosaku shall 他のユーザーのゴミ箱内メモをゴミ箱一覧に表示しない

---

### 3. 復元

**Objective:** As a ユーザー, I want ゴミ箱内のメモを元の状態に戻したい, so that 誤削除したメモを復旧できる

#### Acceptance Criteria

3.1. When ユーザーがゴミ箱内のメモを復元する, the Mosaku shall そのメモをゴミ箱から取り出し通常のメモ一覧に戻す

3.2. When メモが復元される, the Mosaku shall 元のノートブック・タグの関連付けを維持する

3.3. When メモが復元される, the Mosaku shall ゴミ箱移動日時をクリアする

---

### 4. 完全削除

**Objective:** As a ユーザー, I want ゴミ箱内のメモを手動で完全削除したい, so that 不要なメモを即時かつ確実に削除できる

#### Acceptance Criteria

4.1. When ユーザーがゴミ箱内の特定メモを完全削除する, the Mosaku shall そのメモをデータベースから完全に削除する

4.2. When ユーザーがゴミ箱を空にする操作を実行する, the Mosaku shall ゴミ箱内のすべてのメモをデータベースから完全に削除する

4.3. If ゴミ箱が空の状態で「ゴミ箱を空にする」操作が実行される, the Mosaku shall 操作を無効化またはエラーなく無視する

---

### 5. 自動削除

**Objective:** As a ユーザー, I want 古いゴミ箱内メモが自動削除されることを期待したい, so that ゴミ箱が際限なく肥大化しない

#### Acceptance Criteria

5.1. The Mosaku shall ゴミ箱に移動してから30日以上経過したメモを自動的に完全削除する

5.2. The Mosaku shall 自動削除は定期的なバックグラウンド処理として実行する

---

### 6. アクセス制御

**Objective:** As a ユーザー, I want 自分のメモのみゴミ箱操作できることを保証したい, so that 他ユーザーのデータが誤操作・不正操作で削除されない

#### Acceptance Criteria

6.1. The Mosaku shall ゴミ箱への移動・復元・完全削除のすべての操作において、操作対象メモの所有者と認証済みユーザーが一致することを検証する

6.2. If 認証済みユーザーが他のユーザーのメモに対してゴミ箱操作を試みる, the Mosaku shall 403 Forbidden を返す

6.3. While 未認証の状態, the Mosaku shall ゴミ箱関連のすべてのエンドポイントへのアクセスを拒否する

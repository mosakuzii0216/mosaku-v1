# Requirements Document

## Project Description (Input)

メモエディタの自動保存機能。ユーザーが編集を止めてから一定時間後（デバウンス）に自動でサーバーへ保存する。手動保存ボタンは残す。

## Introduction

MemoEditor において、ユーザーが明示的に「保存」ボタンを押さなくても、編集の一時停止を検知して自動的にサーバーへ保存する機能を追加する。これにより保存忘れによるデータ損失を防ぎつつ、手動保存による意図的な確定操作も引き続き利用可能とする。

## Requirements

### Requirement 1: デバウンス自動保存

**Objective:** As a メモを編集するユーザー, I want 編集を止めてから一定時間後に自動でサーバー保存される, so that 保存忘れによるデータ損失を防げる

#### Acceptance Criteria

1. When ユーザーがタイトル・本文・ノートブック・タグのいずれかを変更した, the MemoEditor shall デバウンスタイマーをリセット・起動する
2. When デバウンスタイマーが満了した and 未保存の変更がある, the MemoEditor shall サーバーへ保存リクエストを送信する
3. When 新規作成モード（isCreate=true）でデバウンスタイマーが満了した and タイトルまたは本文が空でない, the MemoEditor shall 新規メモとしてサーバーへ保存リクエストを送信する
4. While デバウンスタイマーが動作中, the MemoEditor shall タイマーをキャンセルせずに待機する（後続の変更でリセットされる）
5. The MemoEditor shall デバウンス待機時間を2秒とする

---

### Requirement 2: 保存状態のUI表示

**Objective:** As a メモを編集するユーザー, I want 現在の保存状態が常に分かる, so that データが安全に保存されているか確認できる

#### Acceptance Criteria

1. While 未保存の変更がある and デバウンスタイマーが動作中, the MemoEditor shall 「保存中...」または「未保存」の状態インジケーターを表示する
2. When 自動保存が成功した, the MemoEditor shall 「保存済み」を示すインジケーターを表示する
3. When 自動保存リクエストが進行中, the MemoEditor shall 「保存中...」を示すインジケーターを表示する
4. If 自動保存が失敗した, the MemoEditor shall エラーを示すインジケーターを表示し、ユーザーに手動保存を促す
5. The MemoEditor shall 保存状態インジケーターを手動保存ボタンの近くに表示する

---

### Requirement 3: 手動保存との共存

**Objective:** As a メモを編集するユーザー, I want 手動保存ボタンで任意のタイミングに保存できる, so that 意図したタイミングで確実に保存できる

#### Acceptance Criteria

1. The MemoEditor shall 手動保存ボタンを引き続き表示する
2. When ユーザーが手動保存ボタンをクリックした and 未保存の変更がある, the MemoEditor shall 即座にサーバーへ保存リクエストを送信する
3. When ユーザーが手動保存ボタンをクリックした, the MemoEditor shall 実行中のデバウンスタイマーをキャンセルする
4. When Cmd+S / Ctrl+S が押された, the MemoEditor shall 手動保存ボタンのクリックと同じ動作を実行する
5. While 保存リクエストが進行中, the MemoEditor shall 手動保存ボタンを無効化する

---

### Requirement 4: 保存処理の制御

**Objective:** As a メモを編集するユーザー, I want 無駄なAPIリクエストが発生しない, so that サーバー負荷を最小化できる

#### Acceptance Criteria

1. If 変更がない（hasChanges=false）, the MemoEditor shall 自動保存リクエストを送信しない
2. If タイトルと本文が両方とも空, the MemoEditor shall 自動保存リクエストを送信しない
3. While 保存リクエストが進行中, the MemoEditor shall 新たな自動保存リクエストを送信しない（重複防止）
4. When コンポーネントがアンマウントされた, the MemoEditor shall 実行中のデバウンスタイマーをキャンセルする

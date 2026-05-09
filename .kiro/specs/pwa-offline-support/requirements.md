# Requirements Document

## Project Description (Input)

Mosaku を PWA 化し、オフラインでもメモの閲覧・編集・検索（ローカルキャッシュ範囲内）ができるようにする。電車での 30 分〜1 時間程度のオフライン利用を主想定とし、駅などでオンライン復帰した際に自動で同期する。マルチデバイス間の競合解決は別 spec で扱うため、本 spec では last-write-wins（後勝ち）で割り切る。

## Introduction

本 spec は Mosaku を Progressive Web App として再構成し、ネットワーク不通時でもメモの閲覧・編集・検索を可能にすることを目的とする。`vite-plugin-pwa` によるアプリシェルキャッシュと、IndexedDB 上のローカルメモストア、および React Query / 自動保存サブシステムとの統合を組み合わせ、ユーザーが「電車に乗る前に開いていたメモ」を継続して編集できる体験を提供する。

スコープ:

- 主想定シナリオ: 電車内 30 分〜1 時間程度のオフライン利用、駅などで再接続した際の自動同期
- 対象データ: 自分が所有するメモ（本文・タイトル・タグ ID・ノートブック ID・`updatedAt`）
- 競合解決: last-write-wins（クライアントの `updatedAt` が新しい方を採用）。本格的な競合解決 UI は別 spec
- ターゲット: ログイン済みのユーザーのみ（オフラインで未ログイン状態からの新規利用はサポートしない）

スコープ外:

- マルチデバイス間の操作的変換（OT）や CRDT による競合解決
- ノートブック・タグ・テーマ等のメモ以外リソースの作成 / 更新（参照のみキャッシュ）
- バックグラウンド Push 通知
- オフラインでの認証（ログイン）
- メモの添付ファイル / 画像のオフライン編集

## Requirements

### Requirement 1: PWA インストールとアプリシェル

**Objective:** ホーム画面に追加できるユーザーとして、 Mosaku をネイティブアプリのように起動したい。それにより、電車に乗る前にブラウザを立ち上げる手間なく素早くメモを開けるようになる。

#### Acceptance Criteria

1. The Mosaku PWA shall ship a Web App Manifest（名前 / アイコン / `display: standalone` / テーマカラー / 開始 URL）を `/` 配下から配信する。
2. When ユーザーが対応ブラウザで本番ドメインに初回アクセスする, the Mosaku PWA shall インストール可能な状態（A2HS 要件を満たした manifest と service worker 登録）になる。
3. When ユーザーが PWA をインストール後にアイコンから起動する, the Mosaku PWA shall ブラウザ UI を含まない standalone モードでアプリシェルを 3 秒以内に表示する（オンライン時 / 4G 想定）。
4. The Mosaku PWA shall アプリシェル（HTML / JS / CSS / フォント / アイコン / テーマ CSS）を Service Worker でプリキャッシュし、オフライン起動時に同等の初期描画を行う。
5. While オフラインで PWA を起動した場合, the Mosaku PWA shall ログイン画面ではなく、最後に同期済みのユーザーセッションでメモ一覧画面に直接遷移する。
6. If 新しい SW がデプロイされて利用可能になった場合, the Mosaku PWA shall ユーザーへ更新通知を出し、ユーザー操作（または次回起動時）で安全に有効化する。

### Requirement 2: オフライン参照可能データのキャッシュ範囲

**Objective:** オフラインで作業するユーザーとして、 直近に触れていたメモが手元に残っていてほしい。それにより、電車内など通信が無い状況でも作業の続きをそのまま再開できる。

#### Acceptance Criteria

1. The Mosaku PWA shall ログイン中ユーザーが所有する未削除メモのうち、 `updatedAt` 降順で最新 N 件（既定 200 件、容量上限 50 MB）を IndexedDB にローカルキャッシュする。
2. The Mosaku PWA shall キャッシュ対象として、メモの本文 / タイトル / タグ ID 配列 / ノートブック ID / `createdAt` / `updatedAt` / 自動保存ステータスメタデータを保持する。
3. When ユーザーがオンラインでメモ一覧画面を開く, the Mosaku PWA shall サーバーから取得した最新メモ一覧でローカルキャッシュを差分更新する。
4. While キャッシュ容量が上限（既定 50 MB）に近づいた場合, the Mosaku PWA shall `updatedAt` が最も古いメモから順にローカルキャッシュから退避し、サーバー上のメモは削除しない。
5. The Mosaku PWA shall ノートブック / タグ / テーマメタデータの参照用スナップショット（読み取り専用）を IndexedDB にキャッシュし、オフライン時のメモ表示に必要な属性解決を可能にする。
6. If ローカルキャッシュが破損 / 読込不能な場合, the Mosaku PWA shall キャッシュを破棄して空状態から再構築し、ユーザーには「オフラインキャッシュを再構築しました」を通知する。

### Requirement 3: オフラインでのメモ閲覧

**Objective:** 通信が無い環境にいるユーザーとして、 キャッシュ済みメモを引き続き閲覧したい。それにより、電車内でも記録した内容を見直し、必要な部分を読み返せる。

#### Acceptance Criteria

1. While オフライン状態, the Mosaku PWA shall ローカルキャッシュ済みメモを一覧 / 詳細画面で読み取り専用 UI 区別なく表示する。
2. If ユーザーがオフライン時に未キャッシュメモへ遷移しようとした場合, the Mosaku PWA shall 「このメモはオフラインキャッシュに含まれていません」というメッセージと、オンライン復帰後に再表示する旨のガイダンスを表示する。
3. The Mosaku PWA shall オフライン時もタグフィルタ / ノートブックフィルタ / 並び替え（更新日時降順）操作をローカルキャッシュ範囲内で動作させる。
4. While オフライン状態でメモ詳細を開いている場合, the Mosaku PWA shall ヘッダーまたはステータスインジケーターで「オフライン」状態を常時可視化する。

### Requirement 4: オフラインでのメモ編集と自動保存

**Objective:** オフラインで書きたいユーザーとして、 編集内容がローカルに確実に残ってほしい。それにより、再接続前にデバイスを閉じても、再起動した瞬間に書きかけが復元される。

#### Acceptance Criteria

1. While オフライン状態でメモを編集中, the Mosaku PWA shall 既存の自動保存タイミング（編集停止後 2 秒）でローカルキャッシュに対して保存し、ステータスインジケーターを `saved`（ローカル）状態に遷移させる。
2. The Mosaku PWA shall オフライン中に行ったメモ更新を、サーバー送信前のキューエントリとして IndexedDB の保留キューに永続化する。
3. The Mosaku PWA shall 保留キューの各エントリに対して、操作種別（更新 / 削除 / ゴミ箱送り）・対象メモ ID・適用すべき本文 / メタデータ・クライアント側 `updatedAt` を保持する。
4. If ユーザーがオフライン中にアプリを完全終了し再起動した場合, the Mosaku PWA shall 起動時にローカルキャッシュ + 保留キューを復元し、未送信の編集内容で UI を表示する。
5. The Mosaku PWA shall オフライン中の同一メモへの複数回の更新について、保留キュー内のエントリを最新内容で上書き（idempotent）し、キューの肥大化を防ぐ。
6. If オフライン中にユーザーがメモをゴミ箱に送る / 完全削除する操作を行った場合, the Mosaku PWA shall ローカルキャッシュ上で論理削除を反映し、対応する操作を保留キューに積む。
7. While オフライン編集中の自動保存ステータス, the Mosaku PWA shall 既存 5 状態（`idle` / `pending` / `saving` / `saved` / `error`）に加えて「未同期（オフライン保存済み）」を視覚的に区別して表示する。

### Requirement 5: オフラインでの検索

**Objective:** 過去のメモを参照したいユーザーとして、 オフラインでもキーワード検索できてほしい。それにより、電車内で「あの話どう書いたっけ」とすぐ思い出せる。

#### Acceptance Criteria

1. While オフライン状態, the Mosaku PWA shall ローカルキャッシュ済みメモの「タイトル」と「本文（プレーンテキスト）」に対するキーワード検索（部分一致 / 大文字小文字非依存）を提供する。
2. When ユーザーが検索クエリを入力する, the Mosaku PWA shall 結果を 300ms 以内（200 件キャッシュ時 / ミドルレンジ端末想定）に最初の結果セットとして返す。
3. The Mosaku PWA shall 検索結果一覧で、ヒットしたメモの更新日時とマッチ箇所のスニペットを表示する。
4. If 検索結果が 0 件で、かつローカルキャッシュ範囲外に該当する可能性がある場合, the Mosaku PWA shall 「オフラインキャッシュ範囲のみ検索しました。オンライン復帰後に全件検索が可能です」と明示する。

### Requirement 6: オンライン復帰時の自動同期（last-write-wins）

**Objective:** オフラインで書いていたユーザーとして、 駅などで再接続した瞬間に自動でサーバーに反映されてほしい。それにより、別デバイスや Web 版を開いたときに最新の内容で続きを書ける。

#### Acceptance Criteria

1. When ネットワーク接続が回復し SW が `online` イベントを観測する, the Mosaku PWA shall 保留キューを `updatedAt` 昇順で順次サーバーへ送信する。
2. The Mosaku PWA shall 同期送信時、各操作のクライアント側 `updatedAt` をリクエストに含め、サーバーが既に保持している `updatedAt` よりクライアント側が新しい場合のみ上書きされるよう振る舞う（last-write-wins）。
3. If サーバー側 `updatedAt` がクライアント側より新しい（= 他デバイスでより新しい更新が行われている）場合, the Mosaku PWA shall そのエントリの上書きをスキップし、サーバー側の最新内容でローカルキャッシュを更新する。
4. If 同期中にネットワークが再切断 / サーバーが 5xx を返す, the Mosaku PWA shall 指数バックオフ（初期 2 秒 / 最大 5 分）でリトライし、保留キューを失わない。
5. If 同期中に 401 / 403 が返る, the Mosaku PWA shall 同期を中断し、ユーザーに再ログインを促し、保留キューは保持する。
6. When 全保留キューの送信が完了する, the Mosaku PWA shall サーバーから最新メモ一覧を再取得し、ローカルキャッシュと React Query キャッシュを同期させる。
7. The Mosaku PWA shall 同期処理中に新規のオフライン編集が発生した場合、保留キューへ追加し、現在の同期サイクル完了後に再送信する。

### Requirement 7: ネットワーク状態とサーバー側エラーハンドリング契約

**Objective:** 編集中のユーザーとして、 自分の変更が「ローカル保存済みなのか」「サーバー送信済みなのか」がいつ見ても分かってほしい。それにより、「これって反映されてる？」という不安なく編集に集中できる。

#### Acceptance Criteria

1. The Mosaku PWA shall グローバルなオンライン / オフライン状態（`navigator.onLine` + heartbeat フォールバック）を判定し、UI からその状態を取得できるストアを提供する。
2. While オフライン状態, the Mosaku PWA shall アプリヘッダーに恒常的なオフラインバナーまたはバッジを表示する。
3. When 保留キューに未同期エントリが存在する, the Mosaku PWA shall ヘッダー / メモ詳細画面で未同期件数を表示する。
4. If サーバー側で同期処理中に 4xx（例: メモが他デバイスで物理削除済み = 404）を受け取る, the Mosaku PWA shall 該当エントリをキューから取り除き、ユーザーへ「このメモはサーバー側で削除されています」を通知する。
5. The Mosaku PWA shall last-write-wins により上書きをスキップしたエントリ件数 / 件名を、同期完了後のトーストでユーザーに告知する。

### Requirement 8: パフォーマンス・容量・ストレージ運用

**Objective:** 長期間使い続けるユーザーとして、 端末のストレージや動作が PWA で劣化してほしくない。それにより、毎日使ってもバッテリー / ストレージへの不安なく使える。

#### Acceptance Criteria

1. The Mosaku PWA shall IndexedDB のメモキャッシュ + 保留キューの合計容量を既定 50 MB 以下に維持する。
2. While ストレージ使用量が上限の 80% を超えた場合, the Mosaku PWA shall ユーザーに通知し、Requirement 2.4 の退避ロジックを起動する。
3. The Mosaku PWA shall アプリシェルのプリキャッシュサイズを既存ビルドサイズの 1.5 倍以下に抑える（テーマ CSS は遅延キャッシュ対象）。
4. The Mosaku PWA shall 既存のテーマエフェクト自動停止条件（`prefers-reduced-motion` / エディタフォーカス / `visibilityState` / マウスアイドル）と矛盾せず、SW 起因の追加 RAF / setInterval を生成しない。
5. If `navigator.storage.estimate()` の利用可能枠が 100 MB 未満の場合, the Mosaku PWA shall キャッシュ件数上限を比例して縮小する。

### Requirement 9: セキュリティとプライバシー

**Objective:** ログインユーザーとして、 オフラインキャッシュが他人や不正アクセスから守られていてほしい。それにより、デバイス共有や紛失時にも自分のメモが流出しない安心感が得られる。

#### Acceptance Criteria

1. The Mosaku PWA shall 認証トークン（アクセス / リフレッシュ）を Service Worker のキャッシュやレスポンスキャッシュへ書き込まない。
2. While ユーザーが明示的にログアウトする, the Mosaku PWA shall IndexedDB 上のメモキャッシュ・保留キュー・ユーザー固有スナップショットを完全削除する。
3. If ローカルキャッシュ内のユーザー ID と現在のセッションのユーザー ID が一致しない場合, the Mosaku PWA shall アプリ起動時にキャッシュをパージしてから読み込む（端末共有時の混入防止）。
4. The Mosaku PWA shall Service Worker から `/api/*` 系の認証必須エンドポイントを SW キャッシュ対象から除外し、必ずネットワーク優先（オンライン時）かつオフライン時は明示的なオフラインフォールバック挙動とする。
5. The Mosaku PWA shall Sentry へオフライン同期エラーを送信する際、メモ本文 / タイトル等のユーザーコンテンツを含めず、既存の `sentry-scrubber` 経由で再送信時のメタデータのみを記録する。

### Requirement 10: 観測性とサポート対応

**Objective:** 運用するチームとして、 オフライン同期で何件失敗したか / どのユーザーがブロックされたかを把握したい。それにより、本番でユーザー体験が崩れていないかを継続的に確認できる。

#### Acceptance Criteria

1. The Mosaku PWA shall 同期成功 / スキップ（last-write-wins）/ 失敗（4xx / 5xx）を Sentry のブレッドクラム + 構造化タグ（`feature_area: memo`、`route`、`user_facing`）で記録する。
2. If 同期がリトライ上限（例: 3 回）に達する場合, the Mosaku PWA shall Sentry に `level: error` のイベントを送出し、`feature_area: memo` / `user_facing: true` を付与する。
3. The Mosaku PWA shall 設定画面または開発者向けデバッグメニューから、ローカルキャッシュ件数 / 保留キュー件数 / 最終同期日時を確認できる UI を提供する。
4. The Mosaku PWA shall 既存の Sentry サンプリング戦略（エラー全件 / トレース 0.1）と矛盾せず、同期処理を独自に高頻度サンプリングしない。

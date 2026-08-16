# Requirements Document

## Project Description (Input)

メモ公開機能：ログインユーザーが自分のメモ単体を「公開」に切り替えると、推測困難なトークンを含む公開URL（例：/p/{token}）が発行され、リンクを知っている人なら未ログインでも閲覧専用でメモの内容を見られる。コメント・編集・複製は不可。公開を解除するとURLは即座に無効化される。ノートブック単位の公開は対象外。トークンはメモごとに1本で、再生成も可能にしたい。所有者は自分の公開メモ一覧をダッシュボードで管理できる。

## Introduction

Mosaku は招待制のメモ・ノートブックアプリであり、現状すべてのメモは所有者本人のみが閲覧可能である。本機能はメモ単体を対象に、所有者が任意のタイミングで「リンクを知っている人だけ未ログインで閲覧できる」公開モードを有効化できるようにする。Notion / Scrapbox に近い "Unlisted URL" 方式を採用し、推測困難なトークンを含む公開URL（`/p/{token}`）を発行・無効化・再生成できる。これにより、ユーザーは招待制クローズドコミュニティを保ったまま、必要なメモだけを外部に共有する手段を得る。

スコープ外: ノートブック単位の公開、検索エンジン向けの公開ギャラリー、閲覧者からのコメント・編集・複製、共有先メールアドレス指定や認可付き共有。これらは将来拡張として議論する。

## Requirements

### Requirement 1: メモの公開・非公開切り替え

**Objective:** As a メモ所有者, I want 自分のメモを公開／非公開に切り替えたい, so that 必要なメモだけを外部に共有しつつ、不要になったら即座に共有を打ち切れる

#### Acceptance Criteria

1. When 所有者が自分のメモに対して公開操作を行ったとき, the Memo Public Sharing Service shall 該当メモを公開状態に遷移させ、推測困難なトークンを生成して保存する
2. When 所有者が自分の公開中メモに対して非公開操作を行ったとき, the Memo Public Sharing Service shall 該当メモを非公開状態に遷移させ、保存されていたトークンを無効化する
3. While メモが非公開状態であるとき, the Memo Public Sharing Service shall 公開URLからの全てのアクセスを 404 として拒否する
4. If 所有者でないユーザーが公開・非公開の切り替え API を呼び出したとき, then the Memo Public Sharing Service shall 操作を拒否し、認可エラーを返す
5. When ゴミ箱に入っている（trashed）メモに対して公開操作が行われたとき, the Memo Public Sharing Service shall 操作を拒否し、ゴミ箱内メモは公開不可である旨のエラーを返す
6. While メモが公開中の状態でゴミ箱に移動されたとき, the Memo Public Sharing Service shall 自動的に該当メモを非公開状態へ遷移させ、トークンを無効化する

### Requirement 2: 公開URLトークンの安全性と再生成

**Objective:** As a メモ所有者, I want 公開URLのトークンが十分推測困難であり、必要に応じて再生成できる, so that 意図しない第三者への露出リスクを最小化し、リンクが流出した際に切り替えられる

#### Acceptance Criteria

1. The Memo Public Sharing Service shall 公開メモごとに最低 128 ビットのエントロピーを持つ URL セーフなトークンを 1 本だけ保持する
2. When 所有者が公開中メモに対してトークン再生成操作を行ったとき, the Memo Public Sharing Service shall 新しいトークンを生成して保存し、以前のトークンを即座に無効化する
3. If 同じトークンが既存の公開メモと衝突したとき, then the Memo Public Sharing Service shall 衝突しないトークンが得られるまで再生成を繰り返す
4. The Memo Public Sharing Service shall トークン自体に所有者識別情報やメモ ID を平文で含めない
5. While 公開メモが存在しているとき, the Memo Public Sharing Service shall トークンとメモ ID の対応をデータベース上のユニーク制約で保護する

### Requirement 3: 未ログイン閲覧者による公開メモの閲覧

**Objective:** As a 公開URLを受け取った閲覧者, I want ログインせずにメモの内容を読みたい, so that 共有を受けた瞬間に追加の手続きなく内容を確認できる

#### Acceptance Criteria

1. When 未ログインの閲覧者が `/p/{token}` にアクセスしたとき, the Memo Public Sharing Service shall 認証なしでメモのタイトル・本文・最終更新日時を返す
2. When 公開メモ閲覧 API がアクセスされたとき, the Memo Public Sharing Service shall 所有者の個人情報（メールアドレス・OAuth プロバイダ・ロール等）を一切レスポンスに含めない
3. If 存在しない・無効化されたトークンでアクセスされたとき, then the Memo Public Sharing Service shall 公開メモの有無を区別できない 404 応答を返す
4. The Memo Public Sharing Service shall 公開メモ閲覧エンドポイントを `@Public()` でグローバル JWT Guard の対象外とする
5. While 閲覧者がログイン済みであるとき, the Memo Public Sharing Service shall ログイン状態に関わらず公開メモを同一の閲覧専用ビューで提供する
6. The Memo Public Sharing Service shall 公開メモ閲覧エンドポイントに対して未ログイン IP 単位のレート制限を適用し、過剰アクセスから所有者のメモを保護する

### Requirement 4: 閲覧者の操作制限（閲覧専用）

**Objective:** As a メモ所有者, I want 公開URL越しの閲覧者が編集・コメント・複製を行えない, so that 公開した内容が改変・拡散されるリスクをコントロールできる

#### Acceptance Criteria

1. The Memo Public Sharing Service shall 公開メモ閲覧 API として読み取り専用のエンドポイントのみを提供し、書き込みエンドポイントは認証必須のままとする
2. If 未ログイン閲覧者が公開メモに対して編集・削除・タグ付け等の書き込み API を呼び出したとき, then the Memo Public Sharing Service shall 401 / 403 で拒否する
3. The Memo Public Sharing Service shall 公開閲覧ビューに編集 UI・コメント入力欄・複製ボタンを表示しない
4. Where 公開閲覧ビューが提供されるとき, the Memo Public Sharing Service shall 「これは閲覧専用の公開メモであり、Mosaku 本体への招待制サインアップ導線があること」を明示する

### Requirement 5: 所有者向けの公開メモ管理ダッシュボード

**Objective:** As a メモ所有者, I want 自分が現在公開しているメモを一覧で把握したい, so that 公開状態が意図と一致しているかを定期的に確認し、漏れなく非公開化できる

#### Acceptance Criteria

1. When 所有者がダッシュボードの公開メモ管理画面を開いたとき, the Memo Public Sharing Service shall 自分が所有する全ての公開中メモを最終公開日時の降順で返す
2. The Memo Public Sharing Service shall 公開メモ管理画面の各エントリに「公開URL のコピー」「トークン再生成」「公開解除」の操作を提供する
3. When 所有者が公開URLコピー操作を行ったとき, the Memo Public Sharing Service shall 完全な公開 URL（プロトコル + ホスト + `/p/{token}`）をクライアントが組み立てられる情報を返す
4. While 所有者の公開メモが 0 件であるとき, the Memo Public Sharing Service shall 「現在公開中のメモはありません」という空状態と公開操作の導線説明を表示する
5. The Memo Public Sharing Service shall 公開状態（公開中 / 非公開）をメモ編集画面からも確認・切り替えできるようにする

### Requirement 6: 観測性・監査・キャッシュ整合性

**Objective:** As a Mosaku 開発・運用者, I want 公開機能に関する異常を早期検知し、共有解除が即時にユーザーへ反映される, so that データ漏洩リスクとサポート対応コストを抑えられる

#### Acceptance Criteria

1. The Memo Public Sharing Service shall 公開化・非公開化・トークン再生成のイベントを `feature_area: memo` タグ付きで Sentry もしくは構造化ログに記録する
2. When 公開・非公開状態が変化したとき, the Memo Public Sharing Service shall 該当メモに関する React Query キャッシュおよび公開メモ一覧キャッシュを無効化する
3. The Memo Public Sharing Service shall 公開メモ閲覧 API のレスポンスに、所有者個人情報を含まない最小限のキャッシュ制御ヘッダー（例: 短時間の `Cache-Control`）を付与し、非公開化直後の閲覧者がスタンプリングの長いキャッシュにヒットして読み続けないようにする
4. If 公開機能関連のエンドポイントで予期しない例外が発生したとき, then the Memo Public Sharing Service shall 例外を Sentry に送出し、`user_facing: true` タグを付与する

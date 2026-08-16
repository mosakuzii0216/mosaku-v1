# Implementation Plan

> frontend 限定スペック。機構 **M1（`registerType:'prompt'` 維持＋ガード通過時に `updateServiceWorker(true)` を自動駆動）** ＋ **Option C（関心分離ハイブリッド）** を実装順に固定する。土台の共有保存状態ストア（Task 1.1）・SW 登録フック再設計（Task 2.1）・PWA 設定の保全確認（Task 5）は別ファイル境界で **並列実行可能 `(P)`**。オーケストレータ（Task 3）は Task 1.1＋2.1 の公開面に依存、通知 UI 撤去（Task 4）は Task 3 に依存、統合テストと本番検証（Task 6）が全体の健全性ゲート。workbox 設定は無改修（Req 4 の保全契約）。

- [x] 1. 共有保存状態の集約（ガードの土台）
- [x] 1.1 (P) 保存状態の横断レジストリストアを新設する
  - 各エディタの保存状態（idle / pending / saving / saved / error / offline-saved）をインスタンス id 単位で集約するレジストリを設け、status の publish と解除を提供する
  - 未保存・進行中・失敗（pending / saving / error）のいずれかが存在するかを単一判定する派生セレクタを提供する（saving の包含で進行中保存の完了待機を、error の包含で失敗時保留を満たす）
  - サーバーデータを持たない一時 UI 状態のみを扱い、React Query 不変則（サーバー状態を Zustand に複製しない）を侵さないことを保つ
  - 6 状態すべてに対する blocking / settled 判定、複数 id の合成、アンマウント時の entry 削除を検証する単体テストを備える
  - _Requirements: 2.1, 2.3, 2.5_

- [x] 1.2 useAutoSave から保存状態を集約ストアへ publish する配線を追加する
  - 既存のデバウンス・状態遷移ロジックを一切変更せず、保存状態の変化をストアへ反映する副作用のみを追加する
  - 各 useAutoSave インスタンスが安定キーで自身の status を publish し、アンマウント時に確実に解除して stale な保留が残らないようにする
  - MemoEditor / NotebookEditor 側の呼び出しは無改修のまま、両エディタが単一配線でガードに参加するようにする
  - 既存の useAutoSave 状態遷移テストが不変で通る（自動保存挙動の回帰なし）ことを確認する
  - 前提: Task 1.1 のストアが存在すること
  - _Requirements: 2.6_

- [x] 2. SW 登録フックの再設計（検知・probe・公開面整理）
- [x] 2.1 (P) 更新シグナルと適用関数中心の公開面へ再設計し手動導線を撤去する
  - 新 SW が waiting に到達したことを示す更新シグナル（updateAvailable）と、skipWaiting＋リロードを実行する適用関数（applyUpdate）のみを公開面とする
  - offlineReady / dismiss / 手動 needRefresh / update といった旧トースト前提の公開面を撤去し、未使用コードを残さない
  - 登録時の legacy api-cache purge（purgeLegacyApiCache）を従来どおり実行する不変則を維持する
  - serviceWorker / caches 非対応環境や登録失敗時に例外を投げず縮退する（既存の onRegisterError ログ挙動を維持）
  - 旧公開面（needRefresh / offlineReady / update / dismiss）前提の既存テストを、新公開面（updateAvailable / applyUpdate）へ再設計する
  - _Requirements: 1.3, 4.3, 5.2, 5.5, 6.4_

- [x] 2.2 定期更新チェックとフォーカス/再訪チェックを新設する
  - アプリ稼働中に一定間隔（公式推奨の 60 分）で新バージョンの有無を確認するポーリングを追加する
  - 再フォーカス・再訪問（visibility 可視化 / focus）時にも新バージョンの有無を確認する
  - インストール進行中・オフライン・非 200 応答のときは probe をスキップし、無駄な更新確認を抑止する
  - probe は既存のテーマエフェクト停止条件（useMoriEffectControl の visibilitychange 監視）と共有状態を持たない独立リスナーとして併存し、エフェクト自動停止判定に干渉しない
  - アンマウント時に interval とリスナーを確実に解除する。fake timers で interval、visibility / focus で更新確認が走ることを検証する
  - 前提: Task 2.1 と同一フックを編集するため 2.1 完了後に着手
  - _Requirements: 3.2, 3.3, 4.4_

- [x] 3. ガード付き自動更新オーケストレータの新設
- [x] 3.1 ガード評価と one-shot 自動リロード起動を実装する
  - 更新シグナル・未保存判定セレクタ・エディタフォーカス状態を購読し、「未保存/進行中/失敗が無く、かつ非フォーカス」のときのみリロードを許可する
  - 更新が存在しないあいだは決してリロードを起動しない
  - 1 更新サイクルにつきリロード起動を高々 1 回に制限し、リロードループを防止する（one-shot ガード）
  - ガード条件が解消（保存確定・フォーカス解除）した瞬間に、保留していたリロードを再評価して実行する
  - 定期チェック検知時もガード条件を尊重したうえで自動更新フローを開始する
  - ガード行列（pending / saving / error / フォーカス中で保留 → settled ∧ 非フォーカスで 1 回 flush、更新なしで無動作、二重リロードしない）を網羅する単体テストを備える
  - 前提: Task 1.1（保存状態ストア）と Task 2.1（updateAvailable / applyUpdate）の公開面が確定していること
  - _Requirements: 1.2, 1.5, 1.6, 2.2, 2.4, 3.5_

- [x] 3.2 恒久保留の bounded escape・不発検知・再武装と観測性を実装する
  - error 等によりリロードが保留され続ける状態を無制限放置せず、保留サイクルの継続を検知して未保存内容の退避 / settled 化を促す導線（bounded escape）を備える
  - 新たな waiting SW（新バージョン）を検知したら one-shot ガードを再武装し、次サイクルの自動更新を再開できるようにする
  - 適用呼出後に一定時間内へ制御交代 / リロードが起きない不発を検知し、次の更新検知で再試行できるようにする
  - 自動リロード起動・保留継続・不発を本番で観測可能にする（Sentry breadcrumb / カウンタ、feature_area:'system'）
  - bounded escape のカウンタ計上・不発検知の breadcrumb・再武装を検証する単体テストを備える
  - 前提: Task 3.1 と同一フックを編集するため 3.1 完了後に着手
  - _Requirements: 2.7, 6.5_

- [x] 4. 更新トーストを撤去し headless 自動更新マウントへ差し替える
  - ガード付き自動更新オーケストレータを駆動して何も描画しない headless マウント点（SwAutoUpdater）を新設する
  - App ルートの更新トースト（SwUpdatePrompt）マウントを headless マウントへ差し替え、更新に関するユーザー向け通知・操作要求を一切出さないようにする
  - SwUpdatePrompt 本体と対応テストをファイルごと削除し、関連する未使用 import・参照を残さない
  - 旧 prompt クライアントが、本クライアント JS の取得（更新操作または全タブクローズ後の再訪、最大 1 サイクル）を経て新方式へ自然移行し、以降は完全自動になる導線を成立させる（kill-switch は導入しない）
  - 前提: Task 3（オーケストレータ）完了後に着手
  - _Requirements: 1.4, 3.1, 3.4, 5.1, 5.3, 5.4_

- [x] 5. (P) PWA ビルド設定の保全を確認しテスト意図を整合させる
  - registerType（'prompt' 据え置き）・theme CSS の CacheFirst ランタイムキャッシュ・precache の globPatterns / globIgnores（themes CSS 除外）・navigateFallback / API denylist を一切変更しないことを差分で確認する
  - pwa-config の既存テストについて、registerType 値アサート（'prompt'）は維持しつつ、テスト名・意図を「ユーザー確認を要する」から「ガード付き自動駆動の基盤として prompt を維持する」契約へ書き換える
  - theme CSS CacheFirst・globIgnores・denylist の不変則アサートを維持する
  - _Requirements: 1.1, 4.1, 4.2, 4.5, 6.4_

- [x] 6. 統合テストと本番検証
- [x] 6.1 自動更新フローの統合テストを整備する
  - 「新版 waiting → 編集中（saving）→ 保存確定 → 自動リロード」が保存状態ストア＋オーケストレータ＋SW 登録フックの連携で成立することを検証する
  - 「フォーカス中は保留 → blur で flush」がエディタフォーカスストア連携で成立することを検証する
  - 自動更新の中核挙動（autoUpdate 相当登録・未保存ガード・通知撤去）が自動テストで担保されていることを確認する
  - 前提: Task 1〜4 の実装が揃っていること
  - _Requirements: 6.2_

- [x] 6.2 健全性ゲートと本番検証記録
  - フロントエンドのビルド・型チェック・lint が新規エラー（未使用 import・未参照シンボル含む）なく通ることを確認する
  - 本番デプロイ後に自動更新で最新バンドルが適用され、削除済み UI（onboarding 等）を含む旧バンドルが表示されないことを確認する
  - 検証結果を `.kiro/specs/onboarding-removal/verification.md` 形式で記録する
  - _Requirements: 6.1, 6.3_

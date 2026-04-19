# キャッチアップ進捗トラッキング

> 詳細な計画・写経対象は [catchup-plan.md](./catchup-plan.md) を参照

## 全体進捗

| Phase | 対象                    | 行数目安 | 状態      | 完了日 |
| ----- | ----------------------- | -------- | --------- | ------ |
| 0     | データモデル            | 166      | ⬜ 未着手 |        |
| 1     | Backend 設定・起動      | ~500     | ⬜ 未着手 |        |
| 2     | 共通基盤                | ~550     | ⬜ 未着手 |        |
| 3     | 認証モジュール          | ~1,800   | ⬜ 未着手 |        |
| 4     | CRUD モジュール群       | ~1,950   | ⬜ 未着手 |        |
| 5     | Frontend 型・定数・util | ~960     | ⬜ 未着手 |        |
| 6     | API・認証 util          | ~940     | ⬜ 未着手 |        |
| 7     | 状態管理                | ~1,500   | ⬜ 未着手 |        |
| 8     | コンポーネント          | ~4,200   | ⬜ 未着手 |        |
| 9     | テーマ・エフェクト      | ~1,500   | ⬜ 未着手 |        |
| 10    | 設定・インフラ          | ~350     | ⬜ 未着手 |        |
| 11    | E2E フロー確認          | —        | ⬜ 未着手 |        |

---

## Phase 0: データモデル

- [ ] Prisma スキーマ写経完了
- [ ] ER 図を手書きできる
- [ ] MemoTag / NotebookTag の中間テーブルパターンを説明できる
- [ ] cascade delete の影響範囲を把握している

## Phase 1: Backend 設定・起動

- [ ] main.ts 写経完了
- [ ] app.module.ts 写経完了
- [ ] config/ 写経完了
- [ ] prisma/ 写経完了
- [ ] NestJS の DI コンテナがモジュール間の依存を解決する仕組みを説明できる
- [ ] `@Global()` デコレータの役割を理解している
- [ ] main.ts の各ミドルウェアが何を防御しているか説明できる

## Phase 2: 共通基盤

- [ ] common/services/ 写経完了
- [ ] common/exceptions/ 写経完了
- [ ] common/filters・guards・decorators 写経完了
- [ ] common/dto・constants・logger 写経完了
- [ ] `BaseOwnableService` の抽象メソッドが具象クラスでどう実装されるか説明できる
- [ ] `checkOwnership()` がどの層で呼ばれるか説明できる
- [ ] AppException → HTTP レスポンスの変換フローを説明できる

## Phase 3: 認証モジュール

- [ ] 型定義（types.ts, oauth.types.ts）写経完了
- [ ] デコレータと Guard 写経完了
- [ ] Strategy（jwt → google → github → line → apple → x）写経完了
- [ ] DTO 写経完了
- [ ] バリデータ 写経完了
- [ ] auth.service.ts 写経完了
- [ ] oauth.service.ts 写経完了
- [ ] jwt.service.ts 写経完了
- [ ] auth.controller.ts 写経完了
- [ ] JWT の生成→検証→Guard の流れを図示できる
- [ ] OAuth リダイレクトフローを説明できる
- [ ] `@Public()` デコレータが Guard 内でどう判定されるか説明できる

## Phase 4: CRUD モジュール群

- [ ] Notebook（最もシンプル）写経完了
- [ ] Invitation 写経完了
- [ ] Memo（検索・ページネーション・ゴミ箱）写経完了
- [ ] Tag（多対多リレーション）写経完了
- [ ] Theme（アクセス制御）写経完了
- [ ] `BaseOwnableService` の具象実装パターンを説明できる
- [ ] N:N リレーション（MemoTag）の作成・削除パターンを説明できる

### --- 中間テスト実施ポイント ---

## Phase 5: Frontend 型・定数・util

- [ ] types/ 写経完了
- [ ] constants/ 写経完了
- [ ] utils/env.ts・logger.ts・passwordValidator.ts 写経完了
- [ ] frontend の型と backend の Prisma モデルの対応関係を説明できる
- [ ] queryKeys の構造が React Query のキャッシュ無効化にどう影響するか説明できる

## Phase 6: API・認証 util

- [ ] utils/auth.ts 写経完了
- [ ] utils/oauthAuth/ 写経完了
- [ ] utils/api.ts 写経完了
- [ ] API リクエスト時の認証ヘッダ付与の仕組みを説明できる
- [ ] トークンの保存・取得・削除のライフサイクルを図示できる

## Phase 7: 状態管理

- [ ] Zustand stores 写経完了
- [ ] React Query hooks 写経完了
- [ ] AuthContext 写経完了
- [ ] 認証 hooks 写経完了
- [ ] ユーティリティ hooks 写経完了
- [ ] Zustand と React Query の責務の違いを説明できる
- [ ] useMutation の onSuccess でキャッシュ無効化するパターンを説明できる
- [ ] AuthContext の Provider パターンを説明できる

## Phase 8: コンポーネント

- [ ] エントリ・レイアウト 写経完了
- [ ] 認証コンポーネント 写経完了
- [ ] メモコンポーネント 写経完了
- [ ] タグコンポーネント 写経完了
- [ ] ノートブック・エディタ 写経完了
- [ ] UI・管理コンポーネント 写経完了

## Phase 9: テーマ・エフェクト

- [ ] themeUtils / themeLoader / themeApplier 写経完了
- [ ] テーマ CSS 写経完了
- [ ] effects/ コンポーネント 写経完了
- [ ] themeEffectRegistry 写経完了
- [ ] テーマの適用フロー（CSS 読み込み → DOM 適用）を説明できる

## Phase 10: 設定・インフラ

- [ ] vite.config.ts / tailwind.config.js 写経完了
- [ ] docker-compose.yml / nginx 写経完了
- [ ] ESLint / tsconfig 写経完了

## Phase 11: E2E フロー確認

- [ ] メモ作成フローを図示できる
- [ ] OAuth ログインフローを図示できる
- [ ] タグフィルタリングフローを図示できる
- [ ] テーマ切り替えフローを図示できる

---

## メモ欄

（写経中に気づいたこと・疑問点をここに記録する）

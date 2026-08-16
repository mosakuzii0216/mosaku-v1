# Research & Design Decisions

---

**Purpose**: `oauth-providers-reduction` の discovery 所見と設計判断の根拠を記録する。design.md はこのログの結論のみを自己完結の形で引用する。

---

## Summary

- **Feature**: `oauth-providers-reduction`
- **Discovery Scope**: Extension（既存 OAuth 基盤への引き算／subtractive）
- **Key Findings**:
  - OAuth 基盤は `oauth-stateless-unification`(完了) により provider 名でパラメータ化済み。LINE/GitHub を各層から取り除くだけで、新規抽象化もスキーマ変更も不要。
  - **要件4の核心が確定**: User モデルに `githubId` 列は**存在しない**。GitHub は Google と**同一の `oauthId` 列を共用**（`oauth.service.ts:122` Google / `:137` GitHub、両方 `providerField='oauthId'`）。プロバイダ判別列は無い。→ GitHub 撤去は「oauthId へ書き込む経路を1つ減らす」だけで Google に構造的に無影響。
  - **provider 列挙が6箇所に散在**（BE 2・FE 4）＝削除漏れのドリフト源。Option C（各サイド1本化）で構造的に予防する方針を採用。
  - **データ保全はスキーマ無変更で達成**: `lineId` 列は保持＝マイグレーション不要。auth ディレクトリ外に `lineId`/`oauthId` 参照ゼロ（結合なし）。
  - **要件3の継続アクセスは既存基盤で充足**: `handleOAuthLogin` の `OR:[{email},{[field]:id}]` による email 起点合流＋`password-reset.service.ts` が実装済み。永久ロックアウトは構造的に起きない。

---

## Research Log

### 識別子マッピングと githubId 調査（要件4の一次資料）

- **Context**: 要件4「GitHub 廃止時の識別子の扱いを確定し Google 取り違えを防ぐ」。
- **Sources Consulted**: `backend/src/auth/oauth.service.ts:110-183`, `backend/prisma/schema.prisma:153-166`。
- **Findings**:

  ```
  google → oauthId   (oauth.service.ts:122)   ← Google
  github → oauthId   (oauth.service.ts:137)   ← ★GitHub も同じ列を共用
  line   → lineId    (oauth.service.ts:152)
  apple  → appleId   (oauth.service.ts:167)
  x      → xId       (oauth.service.ts:182)
  ```

  - `schema.prisma` User: `oauthId`/`lineId`/`appleId`/`xId` は各 `@unique`。**`githubId` 列は無い**。プロバイダ判別列も無い。
  - `handleOAuthLogin`(`:64-80`) は `OR:[{email},{[field]:id}]` で検索 → email 一致で既存アカウントに合流し `update` で `providerField` を上書き。

- **Implications**:
  - GitHub 撤去は subtractive。Google の `oauthId` 利用ロジックは一切変更しない → 要件4.2は削除の性質上そのまま満たされる（`design.md` に明記）。
  - 旧 GitHub ユーザーが同一 email の Google でログインすると `oauthId` が githubId → googleId に上書きされる。これは要件3.2が求める「email 起点合流」そのもの＝正常な移行動線（破壊的削除ではなく列の再利用）。

### provider 列挙のドリフト源（要件1.3・Option 選定の一次資料）

- **Context**: 要件1.3「全導線で表示プロバイダを統一」。削除漏れが起きやすい構造かを確認。
- **Sources Consulted**: grep `'google'|'github'|'line'|'apple'|'x'`。
- **Findings**: 同一の provider union / 配列が独立に **6箇所**:
  - BE: `auth/types/oauth.types.ts:1`（`OAuthProvider` union）、`auth/dto/oauth-start.dto.ts:4`（`OAUTH_START_PROVIDERS` 配列）。
  - FE: `hooks/useOAuth.ts:13`（union）＋`:28`（`OAUTH_PROVIDERS` レコード）、`components/ui/OAuthLoginButton.tsx:3`（union）、`components/auth/AuthForm.tsx:18-29`（labels＋PRIMARY/SECONDARY 配列）、`types/invitation.ts:91`（`InvitationOAuthProvider` union）。
  - 派生参照: `contexts/AuthContext.tsx:28-29,149-150`（`githubLogin`/`lineLogin`）、`utils/oauthAuth.ts`（`GitHubAuthUtils`/`LineAuthUtils`）。
- **Implications**: BE/FE 間に共有パッケージが無いため完全一元化は不可。各サイドで1本の真実源に集約する Option C が現実解。

### 継続アクセス基盤の確認（要件3）

- **Context**: 廃止プロバイダ登録ユーザーを締め出さないことの担保。
- **Sources Consulted**: `oauth.service.ts:58-108`、`backend/src/auth/password-reset.service.ts`(+spec)、`schema.prisma:153`（`email @unique`）。
- **Findings**: 全 User は `email` 必須(unique)。email 起点合流は実装済み。パスワードリセット動線も実装済み。
- **Implications**: 要件3.1/3.2/3.3 は既存基盤で充足。永久ロックアウトは構造的に発生しない（最悪でもパスワード再設定で復帰可能）。

### 依存パッケージ削除可否（R3）

- **Context**: strategy 削除に伴う不要依存の除去可否。
- **Sources Consulted**: `backend/package.json:49-79`、`backend/src/types/passport-line-auth.d.ts`。
- **Findings**: `passport-github2`＋`@types/passport-github2`、`passport-line-auth`＋自作 shim が github/line strategy 専用。`passport-twitter` は X ステートレス化で既に未使用の可能性ありだが本スコープ外。
- **Implications**: github/line strategy 削除後、上記依存＋shim を削除。ビルド・型チェックで未参照を担保。`passport-twitter` は据え置き（別スコープ）。

---

## Architecture Pattern Evaluation

| Option                             | Description                                                  | Strengths                                          | Risks / Limitations                                | Notes                                                       |
| ---------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| **A: 純粋な subtractive**          | 各層から LINE/GitHub 分を機械的に削除                        | 追加ファイルゼロ・最速・回帰面最小                 | provider 列挙6箇所が温存→将来の削除漏れ            | 最小志向の退避先                                            |
| **B: provider レジストリ導入**     | 有効 provider 集合を単一 config 化し UI/DTO/switch を導出    | 将来の増減が config 変更で完結                     | 一度きりの削減に過剰・BE/FE 共有基盤が無く高コスト | 将来リファクタ候補として記録                                |
| **C: 除去＋各サイド1本化**（採用） | A を土台に BE/FE 各サイドの provider 列挙を1つの真実源へ集約 | 低コスト維持＋6箇所→2箇所へ縮約・要件1.3を構造担保 | 若干のリファクタ増（参照張り替え）                 | 人間承認済み。Mosaku は今後も provider 調整あり得るため妥当 |

## Design Decisions

### Decision: 実装アプローチは Option C（除去＋各サイド provider 列挙の1本化）

- **Context**: provider 列挙が6箇所に散在し削除漏れのドリフト源。要件1.3は全導線での統一を要求。
- **Alternatives Considered**: A（純粋 subtractive）／B（レジストリ）／C（除去＋1本化）。
- **Selected Approach**: LINE/GitHub を全層から除去しつつ、**BE は `OAUTH_START_PROVIDERS` 定数を単一の真実源にして `OAuthProvider` union を `typeof ...[number]` で導出**、**FE は provider id 一覧＋型を1モジュールに集約**して `OAuthLoginButton`/`useOAuth`/`AuthForm`/`invitation.ts` から参照させる。
- **Rationale**: A の低コストを保ちつつ 6→2 箇所へドリフト源を縮約。将来の provider 調整（X 集客戦略）でも削除漏れを構造的に予防。人間承認済み。
- **Trade-offs**: 参照張り替えの一手間 +0.5〜1日。ただし回帰は型チェックで機械的に担保。
- **Follow-up**: TS strict の型エラー＋grep で LINE/GitHub 残存ゼロを検証。

### Decision: エンドポイントは route ごと削除して 404 化

- **Context**: 要件2.1「無効化を示す応答（404 または認証失敗 URL リダイレクト）」。
- **Selected Approach**: `/auth/{github,line}` と `/callback` の controller ハンドラ・Guard・Strategy を削除。NestJS が未定義ルートに 404 を返す。
- **Rationale**: 最小変更で 2.1 を充足。残存コード（明示的 404 ハンドラ）を作らない。
- **Trade-offs**: なし。要件は 404 を許容。

### Decision: スキーマ無変更で `lineId` 列とデータを保持（非破壊）

- **Context**: 要件5「破壊的マイグレーションで削除しない」。
- **Selected Approach**: `lineId` 列を schema にそのまま残し、migration は作らない。schema に「LINE 廃止後も監査・復旧用に列保持」コメントを追記。`UserProviderField` 型からは書き込み経路が消えた `'lineId'` を外す（列自体は保持）。
- **Rationale**: 列保持＝データ喪失ゼロ。auth 外に `lineId` 参照が無いため無影響。
- **Trade-offs**: 未使用列が残るが、監査・将来再有効化に備えられる（要件5.2）。

### Decision: 要件3.4「代替手段の告知」はスコープ外（Non-Goal）

- **Context**: 要件3.4は「廃止対象ユーザーへ代替ログイン方法を告知する」と規定。人間の設計判断で**告知は不要**と決定。
- **Selected Approach**: 能動的告知（ログイン画面常設バナー／メール通知）は**実装しない**。継続アクセスは要件3.1〜3.3（email 起点合流＋パスワード再設定）で担保する。
- **Rationale**: 全 User が email 必須(unique)で、他 provider ログインまたはパスワード再設定により**永久ロックアウトは構造的に起きない**。告知が無くても締め出しは発生しないため、告知を Non-Goal と判断。副次的に MailService 連携と本番 DB コホート計測(R1)が不要になり設計が単純化する。
- **Trade-offs**: 廃止直後、旧 LINE/GitHub ボタンを探すユーザーに明示的な案内は出ない。ただしログイン画面には有効3プロバイダ＋メール/パスワード＋「パスワードをお忘れの方」動線が既にあり、自己解決可能。
- **Follow-up**: 承認済み requirements.md の 3.4 と乖離する。requirements の 3.4 を「Non-Goal として descope」へ更新するか、本設計判断を追認する形で整合を取ること（design.md の Non-Goals とトレーサビリティに明記済み）。

## Risks & Mitigations

- **孤立ユーザーの一時的ログイン不能（🟠 High→残留 Low）**: 「LINE/GitHub 専用 × password 未設定 × 他 provider 未連携」のユーザーは削除直後に旧ボタンを失う。→ 全員 email 必須ゆえパスワード再設定で復帰でき**永久ロックアウトにはならない**。告知 Non-Goal のため能動通知は行わないが、継続アクセス手段自体は保証される。
- **provider 列挙の削除漏れ（🟡 Medium）**: 6箇所散在。→ Option C で各サイド1本化＋TS strict 型エラー＋grep で機械的に担保。
- **テスト churn（🟡 Medium）**: backend auth spec 約14本＋frontend auth 系テスト（`OAuthLoginButton.test`/`EmailAuthForm(.newflow).test`/`AuthForm(.newflow).test`/`InvitePage.test` 等）が github/line を参照。→ 削除/更新で対応。要件6.2に織り込み済み。

## References

- `.kiro/specs/oauth-providers-reduction/requirements.md` — 承認済み要件（IDの正）
- `.kiro/specs/oauth-providers-reduction/gap-analysis.md` — 実装ギャップ分析（本 research の一次入力）
- `.kiro/specs/oauth-stateless-unification/` — X ステートレス化（本 spec の前提基盤）
- `.kiro/steering/tech.md` / `structure.md` / `quality.md` — アーキ不変則・品質モデル

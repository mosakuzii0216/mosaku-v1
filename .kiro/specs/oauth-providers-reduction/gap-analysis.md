# 実装ギャップ分析: oauth-providers-reduction

> 承認済み requirements.md と既存コードベースの差分分析。design フェーズの入力とする。
> 前提: 情報提供が目的であり、最終的な実装判断は design で行う。

## 分析サマリ

- **全体は「引き算(subtractive)」タスク**。OAuth 基盤は既に 5 プロバイダを provider 名でパラメータ化済みで、LINE/GitHub を各所から取り除くだけ。新規の抽象化・スキーマ変更は不要。
- **要件4の核心が判明**: User モデルに `githubId` 列は**存在しない**。GitHub は Google と**同一の `oauthId` 列を共用**している（`oauth.service.ts:122` の Google vs `:137` の GitHub。両方 `providerField='oauthId'`）。プロバイダ判別列も無い。
- **Google への影響はゼロ（構造的に保証）**: GitHub 撤去は「oauthId へ書き込む経路を1つ減らす」だけで、Google の oauthId 利用ロジックは一切触らない。要件4.2は削除の性質上そのまま満たされる。
- **UI 導線は2面ある**: ①ログイン画面 `EmailAuthForm.tsx`(5ボタン) ②招待登録画面 `AuthForm.tsx`(PRIMARY/SECONDARY_PROVIDERS 配列)。要件1.3の通り両方の更新が必須。
- **データ保全はスキーマ無変更で達成**: `lineId` 列は残す＝マイグレーション不要。auth ディレクトリ外に `lineId`/`oauthId` の参照は無い（結合ゼロ）。
- **Research Needed 2点**: (a) 締め出しコホートの規模（line 専用 / github 由来 oauthId 専用でパスワード未設定のユーザー数を本番 DB で確認）、(b) 要件3.4「代替手段の告知」の実装形態（既存 MailService 再利用 or ログイン画面告知）。

---

## 1. 現状調査（Current State）

### OAuth アーキテクチャの全体像

`oauth-stateless-unification`(完了済) により、認証フローは以下に統一されている:

| 層         | ファイル                                                  | 役割                                                                                               |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Controller | `backend/src/auth/auth.controller.ts`                     | `/auth/{provider}` + `/auth/{provider}/callback`、および統一登録開始 `/auth/oauth/:provider/start` |
| Service    | `backend/src/auth/oauth.service.ts`                       | `handleOAuthLogin`(共通) + provider 別 `{p}Login` / `{p}RegisterWithStateInvitation`               |
| Strategy   | `backend/src/auth/{google,github,line,apple}.strategy.ts` | Passport 戦略（X のみ passport 廃止・手組み PKCE）                                                 |
| Guard      | `backend/src/auth/oauth-auth.guards.ts`                   | `{Google,GitHub,Line,Apple}AuthGuard`                                                              |
| Config     | `backend/src/config/config.service.ts`                    | provider 別 env getter + `generateOAuthAuthorizationUrl` の switch                                 |
| Types      | `backend/src/auth/types/oauth.types.ts`                   | `OAuthProvider` union + provider 別 interface                                                      |
| DTO        | `backend/src/auth/dto/oauth-start.dto.ts`                 | `OAUTH_START_PROVIDERS` 配列で `@IsIn` バリデート                                                  |

### 識別子マッピング（要件4の一次資料）

```
google → oauthId   (oauth.service.ts:122)   ← Google
github → oauthId   (oauth.service.ts:137)   ← ★GitHub も同じ列を共用
line   → lineId    (oauth.service.ts:152)
apple  → appleId   (oauth.service.ts:167)
x      → xId       (oauth.service.ts:182)
```

- `schema.prisma:151-180` の User: `oauthId`/`lineId`/`appleId`/`xId` は各 `@unique`。**`githubId` 列は無い**。
- `handleOAuthLogin`(`:64-71`) は `OR: [{email}, {[providerField]: providerId}]` で検索 → email 一致で既存アカウントに合流し、`update` で `providerField` を上書き（`:74-80`）。
- **含意**: 旧 GitHub ユーザーが同一 email の Google でログインすると、`oauthId` が githubId → googleId に**上書き**される。これは要件3.2が求める「email 起点の合流」そのもの＝正常な移行動線（破壊的削除ではなく列の再利用）。

### UI 導線（要件1の一次資料）

1. **ログイン画面** `frontend/src/components/auth/EmailAuthForm.tsx:163-167`
   - `<OAuthLoginButton provider="google|github|line|apple|x" />` を5つ描画（login/signup 共通）。
2. **招待登録画面** `frontend/src/components/auth/AuthForm.tsx:27-29`
   - `PRIMARY_PROVIDERS=['google']` / `SECONDARY_PROVIDERS=['github','line','apple','x']`。
   - `useStartOAuthRegistration` → `POST /auth/oauth/:provider/start` 経由（`utils/api.ts:405`）。

`OAuthLoginButton` は上記2面以外では未使用（テスト除く）。

### provider union のハードコード箇所（ドリフト源）

`'google'|'github'|'line'|'apple'|'x'` の union / 配列が独立に **6箇所** 存在:
`oauth.types.ts:1`, `dto/oauth-start.dto.ts:4-10`, `OAuthLoginButton.tsx:3`, `useOAuth.ts:13,28-54`, `AuthForm.tsx:18-29`, `types/invitation.ts:91`（+ `AuthContext` の login 関数群）。BE/FE 間で共有パッケージが無いため一元化は困難。→ 削除漏れが起きやすい構造（後述の approach で対処）。

---

## 2. Requirement → Asset マップ（gap タグ付き）

| Req                                | 対象アセット                                                                                                                                                                                                                                                   | gap タグ             | メモ                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| **1** ログイン画面削減             | `EmailAuthForm.tsx:163-167`, `AuthForm.tsx:27-29`, `OAuthLoginButton.tsx`(github/line icon+config)                                                                                                                                                             | Constraint           | 2面あり両方必須。UI からボタン除去で達成                                            |
| **2** エンドポイント廃止           | `auth.controller.ts:570-617`(github/line route), `oauth-auth.guards.ts:12-16`, `github.strategy.ts`/`line.strategy.ts`(削除), `auth.module.ts:60-67,90-92`, `oauth.service.ts:127-153,257-293`, `config.service.ts:248-271,396-410`, `oauth-start.dto.ts:4-10` | Constraint           | route ごと削除→Nest が 404（要件2.1充足）                                           |
| **2.3** env 未設定で起動継続       | 既存 `isConfigured` warn-and-continue（`github.strategy.ts:22-28` 等）                                                                                                                                                                                         | ✅充足済             | 撤去後は該当コード自体が消えるため自明に成立                                        |
| **3** 既存ユーザー継続アクセス     | `oauth.service.ts:58-108`(email-OR 合流), `password-reset.service.ts`(Req3.3)                                                                                                                                                                                  | ✅基盤あり           | email 起点合流は実装済。パスワードリセット動線あり                                  |
| **3.4** 代替手段の告知             | （既存機構なし）／再利用候補 `MailService`(`mail.module.ts`)                                                                                                                                                                                                   | **Missing**          | ログイン画面告知 or メール通知を design で決定                                      |
| **4** 識別子健全性                 | `oauth.service.ts:122/137`, `schema.prisma:163-166`                                                                                                                                                                                                            | **確定済(要文書化)** | 「githubId 列なし・oauthId 共用・判別列なし」を design に明記                       |
| **4.2** Google 無影響検証          | 同上                                                                                                                                                                                                                                                           | Constraint(自明)     | 削除は subtractive。Google の oauthId 経路は不変                                    |
| **4.3** 残 provider の一意制約維持 | `schema.prisma`(oauthId/xId/appleId `@unique`)                                                                                                                                                                                                                 | ✅充足済             | スキーマ無変更で維持                                                                |
| **5** データ保全（非破壊）         | `schema.prisma:164`(lineId), migration `20260331000000_add_line_apple_x_oauth_ids`                                                                                                                                                                             | Constraint           | **列を残す＝マイグレーション不要**。auth 外に lineId 参照なし                       |
| **6.1** 残 provider 無回帰         | Google/Apple strategy, X 手組みフロー                                                                                                                                                                                                                          | Constraint           | 変更しない＝回帰リスク最小                                                          |
| **6.2** テスト緑維持               | backend auth spec 約15本 + frontend 約4-5本が github/line 参照                                                                                                                                                                                                 | Constraint           | 削除/更新が必要。churn は auth に集中                                               |
| **6.3** docs 整合                  | `docs/deployment/oauth-setup.md`(16), `vercel.md`(22), `cloud-run.md`, `.env.example`(GitHub:108-113,134)                                                                                                                                                      | Constraint           | ★`.env.example` に LINE/Apple は**元々無い**（既存不整合）。GitHub ブロック削除が主 |
| **6.4** CLAUDE.md env リスト       | `CLAUDE.md`「{GOOGLE,GITHUB,LINE,APPLE,X}_CLIENT_\*」                                                                                                                                                                                                          | Constraint           | `{GOOGLE,X,APPLE}_CLIENT_*` へ更新                                                  |

### 付随クリーンアップ（スコープ確認要）

- 依存削除候補: `passport-github2`, `@types/passport-github2`, `passport-line-auth` + 自作 shim `backend/src/types/passport-line-auth.d.ts`。
- `passport-twitter`(`package.json:54`) は X ステートレス化で既に未使用の可能性 → 本 spec では触れない（別スコープ）。

---

## 3. 実装アプローチ options

### Option A: 既存構造から素直に除去（subtractive）— 推奨ベース

各所（controller/guard/strategy/module/service/config/dto/types/UI/docs/env）から LINE/GitHub 分を削除。`lineId` 列とデータは保持。

- ✅ 追加ファイルほぼゼロ。既存パターンに完全準拠。回帰面が小さい
- ✅ route 削除で 404 が自然に成立（要件2.1）
- ❌ provider union が6箇所に散在するため、削除漏れが起きうる（機械的 grep で担保が必要）

### Option B: provider レジストリ導入（config 駆動の有効プロバイダ管理）

「有効プロバイダ集合」を単一の設定にし、UI/DTO/switch を集合から導出。将来の増減を config のみで可能に。

- ✅ 将来の add/remove がデータ変更で完結。ドリフト源を根絶
- ❌ 一度きりの削減に対して過剰。BE/FE 共有パッケージが無く一元化コストが高い
- → **今回は不採用。将来リファクタ候補として記録**

### Option C: ハイブリッド（除去 + 各サイド1本化）— 推奨

Option A を土台に、**BE 側 / FE 側それぞれで provider 列挙を1つの定数へ集約**（例: BE は `OAUTH_START_PROVIDERS` を単一の真実源にして `OAuthProvider` union を導出、FE は `OAUTH_PROVIDERS`(useOAuth) を単一源にして各所参照を寄せる）。

- ✅ Option A の低コストを維持しつつ、6箇所ドリフトを実質2箇所に縮約→今後の削除漏れを予防
- ✅ 要件1.3「全導線で統一」を構造的に担保
- ❌ 若干のリファクタ増（各サイドの参照張り替え）

**判断材料**: 純粋な最小変更なら A、保守性込みなら C。Mosaku は今後も provider 調整があり得る（X 集客戦略）ため、C の付加コストは小さく妥当。

### エンドポイント無効化の方式（要件2.1）

- (a) route/guard/strategy を**削除** → Nest が 404 を返す【推奨・最小】
- (b) route を残し 404/リダイレクトを明示的に返す → 不要な残存コード
- → (a) を推奨。要件2.1は「404 または認証失敗 URL リダイレクト」を許容。

---

## 4. Effort & Risk

- **Effort: M（3〜5日）**
  - 変更ファイルは BE 約10 + FE 約9 + テスト約20 + docs約6 で計40〜50。個々は機械的だが範囲が広くテスト更新が嵩む。Option C を採るなら +0.5〜1日。
- **Risk: 全体 Low〜Medium**（🔴 Critical 該当なし＝コード起因で本番を破壊するリスクは無い。全て subtractive・Google の `oauthId` 経路は不変・スキーマ無変更・auth 外結合ゼロ）

| 深刻度        | リスク                                                                                                                                                                    | 緩和策 / 検出手段                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🟠 **High**   | 「LINE/GitHub 専用 × `password` 未設定 × 他 provider 未連携」の孤立ユーザーが、削除後に一時的にログイン不能になる                                                         | 全員 email 必須(unique) → パスワードリセットで救済でき**永久ロックアウトにはならない**（残留リスクは Low）。規模は **R1（本番 DB 計測）**で確定。プロバイダ判別列が無いため github/google 由来の `oauthId` は区別不能 → 保守的に上限見積もりする |
| 🟡 **Medium** | provider union が6箇所に散在（`oauth.types.ts` / `oauth-start.dto.ts` / `OAuthLoginButton.tsx` / `useOAuth.ts` / `AuthForm.tsx` / `invitation.ts`）→ 削除漏れが起きやすい | TS strict の型エラー + grep で機械的に担保。Option C（各サイドの provider 列挙を1本化）で構造的に予防                                                                                                                                            |
| 🟡 **Medium** | テスト churn が広い（backend auth 約15本 + frontend 約4-5本が github/line 参照）→ 更新漏れで赤化                                                                          | 削除/更新で対応。工数は Effort に織り込み済み（要件6.2）                                                                                                                                                                                         |

---

## 5. design フェーズへの申し送り

### 推奨アプローチと主要判断

1. **Option C（除去＋各サイド provider 列挙の1本化）** を基本線に。最小志向なら A へ縮退可。
2. **エンドポイントは route ごと削除**して 404 化（方式 a）。
3. **スキーマは無変更**。`lineId` 列を保持し、migration は作らない（要件5）。schema に「LINE 廃止後も監査/復旧用に列保持」のコメント追記のみ検討。
4. **要件4の文書化**: 「githubId 列は存在せず GitHub は oauthId を共用、プロバイダ判別列なし。撤去は subtractive で Google に無影響。旧 github 由来 oauthId は次回 Google ログインで googleId に上書き（email 起点合流＝正常移行）」を design に明記。
5. **要件3.4 の告知方式を決定**: 既存 `MailService`（password-reset で実績）再利用のメール通知か、ログイン画面の静的アナウンスか。実装量とリーチで design 判断。

### Research Needed（design or 実装前に確認）

- **R1: 締め出しコホートの規模**。本番 DB で「(a) `lineId` あり かつ email が Google/X/Apple と未連携 かつ `password` 未設定」「(b) `oauthId` が github 由来で同条件」のユーザー数を計測。ゼロなら要件3.4の告知は軽量で可、非ゼロなら能動的メール通知を検討。
  - 注意: **プロバイダ判別列が無い**ため oauthId が github 由来か google 由来かは DB 単体で区別不能。email ドメインや作成時期からの推定、もしくは「password 未設定 かつ 他 provider 列全て null」で保守的に上限見積もりする。
- **R2: 告知チャネルの確定**（R1 の結果に依存）。
- **R3: 依存パッケージ削除の可否**（`passport-github2`/`passport-line-auth`/shim）。ビルド・型への影響確認。`passport-twitter` は本スコープ外として据え置き。

---

_この分析は情報提供であり最終決定ではない。design で approach と R1〜R3 を確定すること。_

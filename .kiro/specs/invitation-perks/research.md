# Research & Design Decisions — invitation-perks

---

**Purpose**: invitation-perks の technical design を支える discovery 結果・設計判断・トレードオフを記録する。

---

## Summary

- **Feature**: `invitation-perks`
- **Discovery Scope**: Extension（既存 `invitation` / `auth` ドメインの拡張。`viral-invitation` で構築済みの招待基盤に特典属性と登録 UX 改修を重ねる）
- **Key Findings**:
  - 課金ウォレット基盤（`subscriptionStatus` / `walletBalanceYen` / `spendingCapYen`）は `rg` で 0 hit。`monetization.md` も「未実装」を明記。R2（COMP 適用本体）は本 spec では実装不能であり、後続 spec へ切り出す前提が正しい。
  - 招待基盤（`InvitationCode` / `InvitationService` / `InvitationController` / `verify-context` / `PrismaQuotaPolicy` / `InvitePage` / `AuthForm`）は `viral-invitation` で完成済み。特典は新規モジュールを作らず既存資産の拡張で実現できる。
  - `User.invitationQuota`（既定 5）が既存 → R3 の「発行数上限」に流用可。`POST /invitation/me` の `createForUser` が `maxUses: 1` 固定である点が R3（人数キャンペーン）の唯一のギャップ。

## Research Log

### 課金ウォレット基盤の実装状況

- **Context**: R2（COMP 無料枠適用）の依存前提を確認する
- **Sources Consulted**: `rg "subscriptionStatus|walletBalanceYen|spendingCapYen"`（backend / frontend で 0 hit）、`.kiro/steering/monetization.md`、`backend/prisma/schema.prisma`
- **Findings**:
  - `User` / `Notebook` に課金カラムは無い。`Purchase` / `AiUsage` モデル・Stripe 連携も未実装。
  - `monetization.md` は COMP 仕様（`subscriptionStatus = COMP`・cron 月次 ¥500 付与・天井 ¥500 固定・3 ヶ月期限・1 人 max ¥1500）を正典として確定済みだが、コードは未着手。
- **Implications**: 本 spec は perk スキーマ・発行/検証への perk 露出・登録 UX・縮退ゲートに限定する。`subscriptionStatus` を設定する適用本体は後続 spec が担う。

### 既存招待基盤の棚卸し

- **Context**: 拡張ポイントと改修対象ファイルを特定する
- **Sources Consulted**: `invitation.service.ts`、`invitation.controller.ts`、`utils/quota-policy.ts`、`dto/*.ts`、`auth.service.ts`、`.kiro/specs/viral-invitation/design.md`、`frontend` の `InvitePage.tsx` / `AuthForm.tsx` / `types/invitation.ts`
- **Findings**:
  - `InvitationCode`: `code`（VarChar50 unique）/ `maxUses`（既定 1）/ `usedCount` / `expiresAt?` / `createdById`。**特典属性なし**。
  - `InvitationService.createForUser(actor)`: nanoid 生成・`PrismaQuotaPolicy` で quota 消費・**`maxUses: 1` 固定**。
  - `InvitationService.createInvitation(dto, adminId)`: ADMIN 経路・`maxUses` / `expiresAt` 可変・legacy 32 文字 hex 生成。
  - `verifyInvitation` の戻り値 `InvitationContext`（`code` / `status` / `creator` / `expiresAt` / `usesRemaining`）に **perk なし**。
  - `verify-context`: `@Public()` + `@Throttle(30/60s)`。
  - `AuthForm.InvitationModeForm`: 招待コード入力欄が**編集可能**、OAuth 5 プロバイダボタンを**縦並び全表示**、**特典バッジなし**、**ログイン導線なし**。
  - `auth.service.register` / OAuth 登録は現状 perk を一切参照せず → 縮退は「現状維持＋ perk を読んでも適用本体を呼ばない」で自然に成立。
- **Implications**: R1=スキーマ＋ DTO 拡張、R3=`createForUser` に `maxUses` を追加、R4=`InvitePage` / `AuthForm` 改修。新規境界は perk ゲートのみ。

### 発行権限ポリシー（quota）

- **Context**: R3.2 / R3.3 の発行権限・上限
- **Sources Consulted**: `utils/quota-policy.ts`、`schema.prisma`（`User.invitationQuota`）
- **Findings**: `PrismaQuotaPolicy.evaluateAndConsume` は ADMIN を無制限扱い（`consumed: false`）、USER は `invitationQuota > 0` を atomic に `decrement`。0 なら `QUOTA_EXHAUSTED`。
- **Implications**: キャンペーンコードも「1 コード発行 = quota 1 消費」で既存ポリシーを流用。1 コードの `maxUses` 上限は DTO の `@Max` で別途ガードし、二軸で乱発を防ぐ。

### エラーコード体系

- **Context**: `maxUses` 上限超過の表現方法
- **Sources Consulted**: `backend/src/common/exceptions/error-codes.ts`
- **Findings**: `ERROR_CODES.INVITATION` = `INVALID_CODE`(INV001) / `EXPIRED`(INV002) / `MAX_USES_REACHED`(INV003) / `NOT_FOUND`(INV004) / `QUOTA_EXHAUSTED`(INV005)。
- **Implications**: `maxUses` 上限超過は DTO `@Max` による `VALIDATION.INVALID_INPUT`（400）で表現し、専用 INV コードを新設しない（最小・独自経路回避）。

## Architecture Pattern Evaluation

| Option                     | Description                                                           | Strengths                             | Risks / Limitations                         | Notes                                          |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| 既存ドメイン拡張（直付け） | `InvitationCode` に perk カラムを直付けし invitation ドメイン内で完結 | 最小変更・`viral-invitation` 資産流用 | `InvitationCode` の責務が微増               | **採用**。R1.4 / R5.5 に合致                   |
| 種別テーブル / Tier 参照   | perk を別テーブルで正規化し参照                                       | 特典種類の拡張に柔軟                  | 招待制小規模に過剰・JOIN 増                 | 不採用（R1.4 が明示排除）                      |
| 独自無料経路               | COMP 専用の課金回避パスを新設                                         | 実装が局所的に見える                  | 計上漏れ・二重実装・monetization 不変則違反 | 不採用（既存ウォレットゲート再利用が正典方針） |

## Design Decisions

### Decision: perk はカラム直付け（enum + nullable）

- **Context**: R1 の特典属性表現
- **Alternatives Considered**:
  1. A — `InvitationCode` に `perkType` enum と `perkCompMonths` を直付け
  2. B — perk 種別テーブル / enum 階層
  3. C — Tier 参照テーブル
- **Selected Approach**: A。`perkType InvitationPerkType @default(NONE)` と `perkCompMonths Int?`。
- **Rationale**: 招待制小規模・R1.4「過剰な種別テーブルや階層参照を導入しない」。`@default(NONE)` で既存レコードを後方互換に吸収。
- **Trade-offs**: 特典種類が増えるとカラムが増える。現状 COMP 1 種なので許容。
- **Follow-up**: 後続 spec で買い切りノート無料券等を足す際にカラム追加 or enum 拡張で対応可能か再評価。

### Decision: COMP 縮退を機能フラグでゲート

- **Context**: R2（基盤未実装時に登録を壊さず、不整合な特典状態も見せない）
- **Alternatives Considered**:
  1. 登録時に COMP 適用をスキップするのみ（verify-context は perk を返す）
  2. 機能フラグ `COMP_PERK_ENABLED`（env・既定 false）で、OFF の間は verify-context の perk 出力も適用も両方ゲートする
- **Selected Approach**: 2。OFF の間は `verifyInvitation` が perk を `NONE` 相当として返し、バッジも適用も発生しない。
- **Rationale**: R2.1（登録成立）と R2.2（不整合な特典状態を提示しない）を単一スイッチで同時担保。後続 spec はフラグを ON にし、適用本体（`subscriptionStatus = COMP` 設定・cron）を差し込むだけで有効化できる。
- **Trade-offs**: 設定フラグが 1 個増える。だが縮退の境界が 1 点に集約され、レビュー容易。
- **Follow-up**: 後続 spec でフラグ ON 時の適用本体・cron・期限管理を実装し、フラグ OFF→ON の移行手順を定義する。

### Decision: 一般ユーザーのキャンペーンは perk=NONE 固定

- **Context**: R3 の発行権限と COMP コスト管理
- **Alternatives Considered**:
  1. `createForUser` 拡張で `maxUses` のみ可変、`perkType=NONE` 固定（perk=COMP 発行は ADMIN 限定）
  2. 一般ユーザーにも perk 指定を開放
- **Selected Approach**: 1。
- **Rationale**: COMP は 1 人あたり月 ¥500 × 最大 3 ヶ月のコスト。一般開放は予算リスク（`monetization.md` のコスト上限管理）。人数キャンペーン（特典なし複数人）は課金非依存で安全に開放できる。
- **Trade-offs**: 一般ユーザーは特典付きコードを配れない。仕様として明示する。
- **Follow-up**: 将来、信頼ユーザーに限定的な COMP 発行枠を与える要否は別途検討。

### Decision: maxUses 上限は DTO バリデーション

- **Context**: R3.3 / R3.4 の `maxUses` 上限と超過時の拒否
- **Selected Approach**: `CreateMyInvitationDto` に `@IsInt() @Min(1) @Max(MAX_CAMPAIGN_MAX_USES)`。超過は `VALIDATION.INVALID_INPUT`（400）。
- **Rationale**: 既存 `class-validator` 流儀に沿い、専用エラーコードを増やさない。
- **Trade-offs**: 超過は VALIDATION エラーとして返るため、フロントは人数上限をメッセージで提示する。
- **Follow-up**: `MAX_CAMPAIGN_MAX_USES`（初期値の目安 20）を `invitation` の定数ファイルに置き、フロント表示と共有。

## Risks & Mitigations

- **基盤未完成で COMP コードを誤発行** → `COMP_PERK_ENABLED` OFF の間は verify-context が perk を出さないため、バッジ・適用とも発生せず安全。
- **キャンペーンコードの乱発** → quota（発行数）＋ `maxUses` 上限（DTO `@Max`）の二重ガード。
- **フロント perk 型と backend enum の drift** → `INVITATION_ERROR_CODES` と同じく「backend と同期」コメント付き共有型で管理し、テストで整合を確認。
- **特典バッジが「もらえる」と誤認させる**（R2.2） → フラグ OFF 時は perk 自体を返さないため現状は表示されない。ON 時の文言は適用が確実な前提で後続 spec が設計。

## References

- [.kiro/steering/monetization.md](../../steering/monetization.md) — COMP 無料枠の正典（適用本体仕様）
- [.kiro/specs/viral-invitation/design.md](../viral-invitation/design.md) — 招待基盤の現行設計（`InvitationService` / `InvitePage` / `AuthForm`）
- `backend/src/invitation/*`、`backend/src/auth/auth.service.ts` — 現行実装
- `frontend/src/components/auth/{InvitePage,AuthForm}.tsx`、`frontend/src/types/invitation.ts` — 登録 UX の改修対象

# Requirements Document

## Introduction

本 spec は、招待コードに「特典」を持たせ、登録前にその価値をユーザーへ見せる登録体験を整える。2026-06-12 のブレストで方向性が確定した招待特典構想を、現行の課金モデル v2（`.kiro/steering/monetization.md` が正典）と整合させて要件化する。

### 前提と現状（重要）

- 課金モデル v2 は **前払いウォレット方式**に確定済み（`walletBalanceYen` / `spendingCapYen` / `subscriptionStatus`）。ブレスト当時の `trialDays` + Stripe `trial_period_days` 方式は**採用されていない**。
- 招待無料枠は **COMP 方式**として正典で確定済み（招待コードで `subscriptionStatus = COMP` 有効化 → cron 月次で `walletBalanceYen` に ¥500 付与 → 天井 ¥500 固定・変更/チャージ不可 → 3 ヶ月の期間限定 → 期限切れで通常無料枠へ）。
- ただし**課金ウォレット基盤は未実装**（`User` / `Notebook` / `Purchase` / `AiUsage` の課金カラム・モデルは Prisma スキーマに未追加。`ai-billing-foundation` spec は中止され、仕様は monetization.md に正典化して吸収済み）。
- 既存の招待基盤: `InvitationCode`（`code` / `maxUses` / `usedCount` / `expiresAt`）、検証 API `POST /invitation/verify` / `POST /invitation/verify-context`（公開・登録前の招待コンテキストを返す）が存在する。

### スコープ（独立部に限定）

本 spec は、課金ウォレット基盤に依存せず即着手できる**独立部のみ**を対象とする。COMP 無料枠特典の「適用本体」は基盤未実装のため本 spec から切り出し、後続 spec（基盤完成後）で扱う。

- **本 spec の対象（独立部）**: 招待コードへの特典属性付与（Requirement 1）、人数キャンペーンコードの発行導線（Requirement 3）、登録 UX の作り直しと特典価値の可視化（Requirement 4）。既存の招待基盤のみで成立する。
- **本 spec の対象外（後続 spec）**: COMP 無料枠特典の適用本体（旧 Requirement 2）。課金ウォレット基盤（`subscriptionStatus` / `walletBalanceYen` / `spendingCapYen` / COMP 月次付与 cron）の完成を前提とするため、別 spec として後続で起票する。
- **本 spec が負う前方互換責務**: COMP 特典属性を持つ招待コードが存在しても、適用基盤が未実装の間は特典を適用せず登録を成立させる（縮退の安全網）。実際の COMP 適用は後続 spec が担う（Requirement 2 に縮退要件として残置）。

## Requirements

### Requirement 1: 招待コードへの特典属性の付与

**Objective:** 招待者として、招待コードに特典の種類と内容を持たせたい。これにより、コードごとに「何を提供する招待か」を表現できる。

#### Acceptance Criteria

1. The Invitation System shall 招待コードに対し、付与する特典の種類（COMP 無料枠 / 特典なし）を表現する属性を保持する。
2. Where 招待コードが COMP 無料枠特典を持つ, the Invitation System shall その無料枠の有効期間（COMP の継続月数）を表現する属性を保持する。
3. The Invitation System shall 特典属性を持たない既存の招待コードを、特典なしのコードとして後方互換に扱う。
4. The Invitation System shall 招待コードのモデルを、招待制小規模運用に見合う最小の構造（特典属性の直付け）で表現し、過剰な種別テーブルや階層参照を導入しない。

### Requirement 2: COMP 特典コードの前方互換縮退（適用本体は後続 spec）

**Objective:** 保守者として、COMP 特典属性を持つ招待コードが存在しても、課金ウォレット基盤が未実装の間は登録が壊れないようにしたい。これにより、特典属性（Requirement 1）を先行導入しても安全に運用できる。

> **スコープ注記**: COMP 無料枠の「適用本体」（`subscriptionStatus = COMP` の設定・月次 ¥500 付与・期限管理）は本 spec の対象外とし、課金ウォレット基盤の完成後に後続 spec で実装する。本要件は、その適用本体が無い間の**縮退挙動のみ**を規定する。

#### Acceptance Criteria

1. When COMP 特典付きの招待コードで登録が行われ、かつ課金ウォレット基盤が未構成または未実装である, the Invitation System shall COMP 特典を適用せず、登録自体は成立させる。
2. The Invitation System shall COMP 特典の不適用時に、ユーザーへ不整合な特典状態（適用されていないのに適用済みと示す等）を提示しない。
3. The Invitation System shall COMP 特典の「適用本体」を本 spec で実装せず、後続 spec（課金ウォレット基盤に依存）の責務として明示的に切り離す。
4. Where COMP 適用本体が後続 spec で実装される, the Invitation System shall monetization.md が正典とする COMP 仕様（天井 ¥500 固定・cron 月次付与・期限切れ降格）に準拠し、既存のウォレット残高・天井ガードを再利用する設計余地を残す。

### Requirement 3: 人数キャンペーンコードの発行導線（課金基盤に非依存）

**Objective:** ユーザーとして、特典なしで複数人を招待できるキャンペーンコードを発行したい。これにより、課金基盤の有無に関わらず友人を招ける。

#### Acceptance Criteria

1. The Invitation System shall 1 つのコードで複数人が登録できる招待コード（`maxUses` が複数）の発行をサポートする。
2. The Invitation System shall キャンペーンコードの発行を、認証済みユーザーが自身の権限で行えるものとし、未認証ユーザーの発行を拒否する。
3. The Invitation System shall 1 ユーザーが発行するコードの `maxUses` 上限、および同時に有効化できるコード数の上限を設け、乱発を防ぐ。
4. When ユーザーが発行上限を超える発行を要求する, the Invitation System shall その発行を拒否し、超過理由を提示する。
5. When キャンペーンコードで登録が行われる, the Invitation System shall `usedCount` を増加させ、`maxUses` に達したコードでの追加登録を拒否する。
6. The 人数キャンペーンコード機能 shall 課金ウォレット基盤に依存せず、既存の招待基盤のみで成立する。

### Requirement 4: 登録 UX の作り直しと特典価値の可視化（課金基盤に非依存）

**Objective:** 招待された見込みユーザーとして、登録前に「このコードで何がもらえるか」を理解したい。これにより、登録の価値が伝わり、招待からの登録転換が高まる。

#### Acceptance Criteria

1. When 招待コードのコンテキストを検証する, the Invitation System shall 検証応答にそのコードの特典情報（特典の種類・内容）を含める。
2. While 招待コードが URL 等から事前に与えられている, the Registration UI shall そのコードを適用済みとして提示し、編集を要求しない導線を提供する。
3. Where 招待コードが特典を持つ, the Registration UI shall 登録前にその特典の価値をユーザーに見える形（特典バッジ等）で提示する。
4. The Registration UI shall 既存ユーザーが招待経由の画面からログインへ遷移できる導線を提供する。
5. The Registration UI shall 認証手段（OAuth プロバイダ・メール）の提示において、主要な少数の手段を既定で表示し、残りの手段は明示的な展開操作の先に配置することで、初期表示の選択過多を避ける。
6. The 登録 UX 機能 shall 特典価値の提示を、特典が未構成（特典なしコード）の場合にも破綻なく成立させる。

### Requirement 5: スコープ境界と依存前提の明示

**Objective:** 保守者として、本 spec の実装可能範囲と課金基盤への依存を明確にしたい。これにより、基盤未実装のまま COMP 適用本体を実装してしまう手戻りを防ぐ。

#### Acceptance Criteria

1. The Invitation Perks Spec shall 本 spec の実装対象を独立部（Requirement 1・3・4）に限定し、既存の招待基盤のみで成立させる。
2. The Invitation Perks Spec shall COMP 無料枠特典の適用本体を本 spec の対象外とし、課金ウォレット基盤の完成を前提とする後続 spec の責務として切り離す。
3. The Invitation Perks Spec shall COMP 特典属性を持つコードに対する前方互換の縮退挙動（Requirement 2）のみを本 spec で担保し、適用本体は実装しない。
4. The Invitation Perks Spec shall 課金状態の真実の源泉を Stripe（webhook）と DB とし、フロントのクライアント状態へ課金状態を複製しない既存アーキ不変則に従う。
5. The Invitation Perks Spec shall 特典の付与・検証を既存の招待基盤（`InvitationCode` / `viral-invitation` / `invitation-manager-api-client` 系）の流用を第一候補とし、独自経路の新設を避ける。

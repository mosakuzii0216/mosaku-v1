# Requirements Document

## Project Description (Input)

AI課金基盤（ai-billing-foundation）。mosaku の AI 機能（ゴーストライター・AI対話メモ化・朝のダイジェスト）すべての土台となる従量課金基盤を実装する。正典は .kiro/steering/monetization.md（課金モデル v2）。

【目的】AI を呼ぶすべてのパスが共通で通る「ウォレット残高チェック → AI 実行 → AiUsage 計上 → 残高減算」の課金ゲートを作る。これ単体ではユーザー向け AI 機能は提供せず、後続の ai-ghostwrite 等が乗る基盤に徹する。

【課金モデル v2（確定仕様）】

- 課金方式 = 前払いウォレット。月額¥500 のサブスクで ¥500 ぶんの walletBalanceYen を毎月付与。AI 利用のたび「トークン原価 ×1.5（マージン50%）」を残高から減算。
- 天井（spendingCapYen、デフォルト¥2000・ユーザー変更可）= その月にチャージ・消費してよい上限。到達でハードストップ（AI停止）＋「天井を上げる？」引き上げ導線を提示。
- 回数制限は撤廃。純・従量。
- AI はノートブック課金単位に紐づく。
- 招待無料枠（COMP）= 友人知人向け。招待コードで subscriptionStatus=COMP 有効化、cron で毎月¥500付与、天井¥500固定・変更/チャージ不可、3ヶ月の期間限定。期限切れで通常無料枠（AIなし）へ。コスト上限は 1 人 max ¥1500。

【データモデル（Prisma 追加）】

- User 拡張: stripeCustomerId, subscriptionStatus(NONE|ACTIVE|CANCELED|EXPIRED|COMP), subscriptionExpiresAt, spendingCapYen(default 2000), walletBalanceYen(default 0), notebookCredits(default 0)
- AiUsage（新規・従量消費の唯一の根拠）: userId, notebookId, action, tokensUsed, costYen, createdAt
- Purchase（新規）: type(SINGLE_NOTEBOOK|NOTEBOOK_PACK|SUBSCRIPTION), amount, currency('jpy'), status(PENDING|COMPLETED|FAILED|REFUNDED), stripePaymentIntentId?, stripeSubscriptionId?
- 注: Notebook 拡張（characterLimit/isFree/purchaseId）は買い切り課金側の話なので本 spec のスコープ外候補。

【不変則（必須）】

- AI 実行前にウォレット残高と天井を必ずチェックし、残高不足・天井超過の呼び出しはブロック（ハードストップ）。停止時は引き上げ導線を提示。
- AI を呼ぶ全機能は AiUsage 計上を経由（計上漏れ＝請求漏れ）。トークン原価→円換算（×1.5）も AiUsage に記録。
- 自動生成系（朝のダイジェスト等）は実行前に必ず天井ガードを通す（最も天井に当たりやすい）。
- 課金状態の真実の源泉は Stripe（webhook）と DB。フロント Zustand へ課金状態をコピーしない。
- API は apiClient 経由。所有権チェックは AuthorizationService.validateOwnership。認証はグローバル JWT Guard + @Public() オプトアウト。
- 残高減算と AiUsage 計上はトランザクション整合を保つ（二重計上・取りこぼし防止）。

【スコープ想定】

- IN: 課金ゲート（AiUsage 計上＋残高減算＋天井/残高ガードを一元化するサービス）、Prisma スキーマ＋マイグレーション、Stripe サブスク（月額¥500・ウォレット付与）と追加チャージ（Payment Intent）＋webhook、天井設定 API、残高/使用状況の参照 API、ハードストップ時のエラー契約（フロントが引き上げ導線を出せる形）、招待無料枠（COMP）の有効化・cron 月次付与・天井固定ガード・期限切れ遷移。
- OUT: 具体的な AI 機能そのもの（ghostwrite 等は別 spec）、買い切りノートブック課金（Notebook 課金カラム）、為替レート自動更新（換算テーブルの持ち方は未決）、80%事前警告通知（将来検討）、残高繰り越し（未決）。

言語は日本語。

## Introduction

本仕様は mosaku の全 AI 機能が共通で通る**従量課金基盤**を定義する。正典は `.kiro/steering/monetization.md`（課金モデル v2）。

課金方式は**前払いウォレット**。月額 ¥500 のサブスクで ¥500 ぶんの残高（`walletBalanceYen`）を毎月付与し、AI 利用のたびに「トークン原価 ×1.5（マージン 50%）」を残高から減算する。当月の天井（`spendingCapYen`、デフォルト ¥2000・ユーザー変更可）に到達するとハードストップ（AI 停止）し、「天井を上げる？」の引き上げ導線を提示する。

本基盤の中核は、AI を呼ぶ**すべてのパスが共通で通る課金ゲート**（残高・天井ガード → AI 実行 → `AiUsage` 計上 → 残高減算）である。本 spec 単体ではユーザー向け AI 機能は提供せず、後続の `ai-ghostwrite` 等が乗る土台に徹する。

**スコープ外**（別 spec／将来検討）: 具体的な AI 機能（ghostwrite 等）、買い切りノートブック課金（Notebook の `characterLimit`/`isFree`/`purchaseId` カラム）、為替レート自動更新、80% 事前警告通知、月初の残高繰り越し。

> 本書の受け入れ基準（Acceptance Criteria）は EARS 形式で記述する。トリガー語と固定句（When / If / While / Where / The [system] shall）は英語、可変部は日本語で表記する。

## Requirements

### Requirement 1: 課金ゲート（残高・天井ガード）

**Objective:** AI 機能を利用するユーザーとして、AI 実行の前に必ずウォレット残高と天井がチェックされてほしい。それにより想定外の請求が発生せず、安心して AI を使えるようにするため。

#### Acceptance Criteria

1. When AI 実行リクエストを受け取ったとき, the 課金ゲート shall 当該ユーザーのウォレット残高・当月消費・天井を評価してから AI 実行の可否を判定する。
2. If 次回想定コストがウォレット残高を超えるとき, then the 課金ゲート shall AI 実行をブロックし、ハードストップ応答を返す。
3. If 当月の消費見込みが `spendingCapYen` を超えるとき, then the 課金ゲート shall AI 実行をブロックし、ハードストップ応答を返す。
4. While ウォレット残高と天井の双方に余裕があるとき, the 課金ゲート shall AI 実行を許可する。
5. The 課金ゲート shall 手動トリガー・自動生成を問わず、AI を呼ぶ全パスが本ガードを経由することを保証する。
6. When 自動生成系（朝のダイジェスト等のバックグラウンド生成）の AI 実行を行うとき, the 課金ゲート shall 実行前に必ず天井ガードを通す。

### Requirement 2: AiUsage 計上と残高減算のトランザクション整合

**Objective:** サービス運営者として、AI 実行のたびに使用量が確実に計上され、残高減算と整合してほしい。それにより請求漏れ・二重計上が起きないようにするため。

#### Acceptance Criteria

1. When AI 実行が成功したとき, the 課金基盤 shall `AiUsage` レコード（`userId` / `notebookId` / `action` / `tokensUsed` / `costYen` / `createdAt`）を 1 件記録する。
2. When `AiUsage` を計上するとき, the 課金基盤 shall トークン原価を円換算（原価 ×1.5）した値を `costYen` として記録する。
3. The 課金基盤 shall `AiUsage` の計上と `walletBalanceYen` の減算を単一トランザクションで実行し、整合を保つ。
4. If 計上または残高減算のいずれかが失敗したとき, then the 課金基盤 shall トランザクション全体をロールバックし、二重計上・取りこぼしを防ぐ。
5. The 課金基盤 shall `AiUsage` を従量消費の唯一の根拠として扱い、他経路での残高減算を認めない。

### Requirement 3: 課金データモデル（Prisma スキーマ拡張）

**Objective:** 開発者として、課金に必要なスキーマ拡張がほしい。それにより残高・天井・購入履歴・使用量を永続化できるようにするため。

#### Acceptance Criteria

1. The 課金基盤 shall `User` に `stripeCustomerId` / `subscriptionStatus`(NONE|ACTIVE|CANCELED|EXPIRED|COMP) / `subscriptionExpiresAt` / `spendingCapYen`(default 2000) / `walletBalanceYen`(default 0) / `notebookCredits`(default 0) を保持する。
2. The 課金基盤 shall `AiUsage` モデル（`userId`, `notebookId`, `action`, `tokensUsed`, `costYen`, `createdAt`）を保持する。
3. The 課金基盤 shall `Purchase` モデル（`type`(SINGLE_NOTEBOOK|NOTEBOOK_PACK|SUBSCRIPTION), `amount`, `currency`='jpy', `status`(PENDING|COMPLETED|FAILED|REFUNDED), `stripePaymentIntentId`?, `stripeSubscriptionId`?）を保持する。
4. When スキーマを変更したとき, the 課金基盤 shall 変更をマイグレーションとして管理し、`AiUsage` を `userId` / `notebookId` で参照できるようにする。
5. Where 買い切りノートブック課金カラム（Notebook の `characterLimit` / `isFree` / `purchaseId`）が関わるとき, the 課金基盤 shall 本 spec のスコープ外として扱い、本基盤の必須要素に含めない。

### Requirement 4: 月額サブスクとウォレット付与（Stripe Subscription + webhook）

**Objective:** ユーザーとして、月額 ¥500 のサブスクで毎月 ¥500 ぶんの AI 残高が付与されてほしい。それにより毎月一定額で AI を使い始められるようにするため。

#### Acceptance Criteria

1. When ユーザーが月額 ¥500 サブスクの決済を完了したとき, the 課金基盤 shall Stripe Subscription を作成し、`subscriptionStatus` を ACTIVE にする。
2. When サブスクの請求成功（更新）webhook を受信したとき, the Stripe Webhook ハンドラ shall `walletBalanceYen` に ¥500 ぶんを付与する。
3. When サブスクのキャンセル／失効 webhook を受信したとき, the Stripe Webhook ハンドラ shall `subscriptionStatus` を CANCELED／EXPIRED に更新し、`subscriptionExpiresAt` を反映する。
4. The 課金基盤 shall 価格・通貨を `jpy` で扱う。
5. The 課金基盤 shall 課金状態の真実の源泉を Stripe（webhook）と DB に置き、フロント Zustand に課金状態をコピーしない。
6. If 署名検証に失敗した webhook を受信したとき, then the Stripe Webhook ハンドラ shall リクエストを拒否し、DB を変更しない。

### Requirement 5: 追加チャージ（Stripe Payment Intent + webhook）

**Objective:** ユーザーとして、残高が尽きたら天井までの範囲で追加チャージできてほしい。それにより上限内で AI を使い続けられるようにするため。

#### Acceptance Criteria

1. When ユーザーが追加チャージを要求したとき, the 課金基盤 shall Stripe Payment Intent を作成し、`Purchase` を PENDING で記録する。
2. When チャージ決済の成功 webhook を受信したとき, the Stripe Webhook ハンドラ shall `walletBalanceYen` にチャージ額を加算し、対応する `Purchase` を COMPLETED にする。
3. If チャージ後の当月チャージ・消費の合計が `spendingCapYen` を超えるとき, then the 課金基盤 shall そのチャージ要求をブロックする。
4. If チャージ決済が失敗したとき, then the Stripe Webhook ハンドラ shall `Purchase` を FAILED にし、`walletBalanceYen` を変更しない。

### Requirement 6: 天井（spendingCapYen）設定 API

**Objective:** ユーザーとして、当月の天井（`spendingCapYen`）を自分で設定できてほしい。それにより支出の上限を自分でコントロールできるようにするため。

#### Acceptance Criteria

1. When ユーザーが天井設定を取得するとき, the 課金基盤 shall 現在の `spendingCapYen` を返す。
2. When ユーザーが天井を更新するとき, the 課金基盤 shall `spendingCapYen` を新しい値に更新する。
3. The 課金基盤 shall `spendingCapYen` のデフォルトを ¥2000 とする。
4. If 天井に不正な値（負値・非数値・既消費額未満など）が指定されたとき, then the 課金基盤 shall 更新を拒否し、バリデーションエラーを返す。
5. The 課金基盤 shall 天井設定 API へのアクセスを所有者本人のみに許可する（`AuthorizationService.validateOwnership`）。

### Requirement 7: 残高・使用状況の参照 API

**Objective:** ユーザーとして、自分の残高と今月の使用状況を確認できてほしい。それにより残高の減り方や天井までの余裕を把握できるようにするため。

#### Acceptance Criteria

1. When ユーザーが残高を参照するとき, the 課金基盤 shall `walletBalanceYen` と `subscriptionStatus` を返す。
2. When ユーザーが使用状況を参照するとき, the 課金基盤 shall 当月の消費額・天井（`spendingCapYen`）・残高を返す。
3. The 課金基盤 shall 参照 API を認証済みユーザー自身のデータに限定する。
4. The 課金基盤 shall 当月消費の算出根拠を `AiUsage` の集計とする。

### Requirement 8: ハードストップ時のエラー契約

**Objective:** フロントエンドとして、ハードストップを判別できる構造化エラーがほしい。それにより「天井を上げる？」「チャージする？」の引き上げ導線を出せるようにするため。

#### Acceptance Criteria

1. When 残高不足または天井超過で AI 実行をブロックしたとき, the 課金ゲート shall ブロック理由（残高不足 / 天井超過）を識別できる構造化エラーを返す。
2. The 課金ゲート shall ハードストップを通常のエラーと区別できる一意のエラーコードで表現する。
3. The エラー契約 shall 現在残高・当月消費・現在の天井など、引き上げ導線の提示に必要な情報を含む。
4. When フロントがハードストップ応答を受け取ったとき, the フロントエンド shall 引き上げ導線（天井を上げる／追加チャージ）を提示できる。

### Requirement 9: アーキテクチャ・セキュリティ不変則の遵守

**Objective:** 開発者として、課金基盤が既存アーキテクチャの不変則に従ってほしい。それにより一貫性とセキュリティを保てるようにするため。

#### Acceptance Criteria

1. The 課金基盤 shall フロントからの API コールを `apiClient` 経由とし、直接 `fetch` を使わない。
2. The 課金基盤 shall 所有権チェックを `AuthorizationService.validateOwnership` で一元化する。
3. The 課金基盤 shall 認証をグローバル JWT Guard とし、Stripe webhook 等の公開エンドポイントのみ `@Public()` でオプトアウトする。
4. The 課金基盤 shall サーバー状態（残高・天井・課金状態）の真実の源泉を React Query とし、Zustand に課金状態をコピーしない。

### Requirement 10: 招待無料枠（COMP）の付与・期限・コスト固定

**Objective:** 招待された友人知人として、招待コードで決済なしに一定期間 AI を使えてほしい。それにより費用負担なく mosaku の AI を試せるようにするため。同時にサービス運営者として、無料付与の持ち出しコストを構造的に上限固定したい。

#### Acceptance Criteria

1. When ユーザーが有効な招待コードを入力したとき, the 課金基盤 shall `subscriptionStatus` を COMP にし、`subscriptionExpiresAt` を有効化時点 + 3ヶ月に設定する。
2. When COMP を有効化したとき, the 課金基盤 shall `spendingCapYen` を ¥500 に固定する。
3. While `subscriptionStatus` が COMP であるとき, the 課金基盤 shall `spendingCapYen` の変更要求と追加チャージ要求を拒否する。
4. When 月次バッチ（cron）が実行されたとき, the 課金基盤 shall COMP かつ未失効ユーザーの `walletBalanceYen` を ¥500 にリセット付与する（前月残は繰り越さない）。
5. When `subscriptionExpiresAt` に到達した COMP ユーザーを月次バッチが検出したとき, the 課金基盤 shall `subscriptionStatus` を EXPIRED に更新し、以降の AI 実行を通常無料枠（AI なし）として扱う。
6. While `subscriptionStatus` が COMP であるとき, the 課金ゲート shall 通常と同一のゲート（残高・天井チェック → `AiUsage` 計上 → 残高減算）を経由させ、COMP 専用の計上回避パスを設けない。
7. If 無効・使用済み・期限切れの招待コードが入力されたとき, then the 課金基盤 shall COMP 有効化を拒否する。

# Requirements Document

## Project Description (Input)

AI課金基盤（ai-billing-foundation）。mosaku の AI 機能（ゴーストライター・AI対話メモ化・朝のダイジェスト）すべての土台となる従量課金基盤を実装する。正典は .kiro/steering/monetization.md（課金モデル v2）。

【目的】AI を呼ぶすべてのパスが共通で通る「ウォレット残高チェック → AI 実行 → AiUsage 計上 → 残高減算」の課金ゲートを作る。これ単体ではユーザー向け AI 機能は提供せず、後続の ai-ghostwrite 等が乗る基盤に徹する。

【課金モデル v2（確定仕様）】

- 課金方式 = 前払いウォレット。月額¥500 のサブスクで ¥500 ぶんの walletBalanceYen を毎月付与。AI 利用のたび「トークン原価 ×1.5（マージン50%）」を残高から減算。
- 天井（spendingCapYen、デフォルト¥2000・ユーザー変更可）= その月にチャージ・消費してよい上限。到達でハードストップ（AI停止）＋「天井を上げる？」引き上げ導線を提示。
- 回数制限は撤廃。純・従量。
- AI はノートブック課金単位に紐づく。

【データモデル（Prisma 追加）】

- User 拡張: stripeCustomerId, subscriptionStatus(NONE|ACTIVE|CANCELED|EXPIRED), subscriptionExpiresAt, spendingCapYen(default 2000), walletBalanceYen(default 0), notebookCredits(default 0)
- AiUsage（新規・従量消費の唯一の根拠）: userId, notebookId, action, tokensUsed, costYen, createdAt
- Purchase（新規）: type(SINGLE_NOTEBOOK|NOTEBOOK_PACK|SUBSCRIPTION), amount, currency('jpy'), status(PENDING|COMPLETED|FAILED|REFUNDED), stripePaymentIntentId?, stripeSubscriptionId?
- 注: Notebook 拡張（characterLimit/isFree/purchaseId）は買い切り課金側の話なので本 spec のスコープ外候補。

【不変則（必須）】

- AI 実行前にウォレット残高と天井を必ずチェックし、残高不足・天井超過の呼び出しはブロック（ハードストップ）。停止時は引き上げ導線を提示。
- AI を呼ぶ全機能は AiUsage 計上を経由（計上漏れ＝請求漏れ）。トークン原価→円換算（×1.5）も AiUsage に記録。
- 自動生成系（朝のダイジェスト等）は実行前に必ず天井ガードを通す（最も天井に当たりやすい）。
- 課金状態の真実の源泉は Stripe（webhook）と DB。フロント Zustand へ課金状態をコピーしない。
- API は apiClient 経由。所有権チェックは AuthorizationService.checkOwnership。認証はグローバル JWT Guard + @Public() オプトアウト。
- 残高減算と AiUsage 計上はトランザクション整合を保つ（二重計上・取りこぼし防止）。

【スコープ想定】

- IN: 課金ゲート（AiUsage 計上＋残高減算＋天井/残高ガードを一元化するサービス）、Prisma スキーマ＋マイグレーション、Stripe サブスク（月額¥500・ウォレット付与）と追加チャージ（Payment Intent）＋webhook、天井設定 API、残高/使用状況の参照 API、ハードストップ時のエラー契約（フロントが引き上げ導線を出せる形）。
- OUT: 具体的な AI 機能そのもの（ghostwrite 等は別 spec）、買い切りノートブック課金（Notebook 課金カラム）、為替レート自動更新（換算テーブルの持ち方は未決）、80%事前警告通知（将来検討）、残高繰り越し（未決）。

言語は日本語。

## Requirements

<!-- Will be generated in /kiro:spec-requirements phase -->

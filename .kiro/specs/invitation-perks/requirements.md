# Requirements Document

## Project Description (Input)

招待コードに「性格（特典）」を持たせる将来 spec。2026-06-12 のブレストで方向性確定。課金ロードマップの派生で、招待制小規模向けに招待コードへ課金特典を後乗せする。

確定した特典は3パターン（ユーザー選択。初期ウォレット残高=AIお試しは不採用）:

1. 無料ノートブック枠 — notebookCredits を付与（器は課金基盤側で想定）。ただし「クレジット消費して有料ノートを開く」ロジックは買い切りノート課金 spec に依存し、エンドツーエンドには買い切り spec も必要。
2. サブスク無料期間 — trialDays 新設 + Stripe trial_period_days。⚠️ trial 中は invoice 不発火で付与ロジックが走らない論点あり。
3. 人数だけ（特典なしキャンペーン）— maxUses は既存・スキーマ変更不要。「一般ユーザーがキャンペーンコードを作れるか」の発行導線だけ決めればよい。

モデル化の方向: A=InvitationCode に特典カラム直付け（grantNotebookCredits / trialDays）が招待制小規模には素直（推奨）。B=種別 enum、C=Tier 参照テーブルは過剰。

登録UX の作り直しもセット（現状の不満: コードが URL から来てるのに編集可能 input／特典の価値が一切見えない／OAuth 5個+メールで選択過多／招待モードにログイン導線なし）。verify-context レスポンスに特典情報を載せ、「✓適用済み」表示＋特典バッジ（🎁有料ノート1冊無料 / ✨1ヶ月無料）で登録前に価値を見せる。

進め方: 課金基盤（ai-billing-foundation）先行を前提としていたが、当該基盤 spec は中止・削除（課金モデル v2 を steering に正典化して吸収）された経緯がある。requirements フェーズで「特典の器（notebookCredits / trialDays / Stripe 連携）をどこに持たせるか」の前提を最初に確認・再定義すること。

## Requirements

<!-- Will be generated in /kiro:spec-requirements phase -->

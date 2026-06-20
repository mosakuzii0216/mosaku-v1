# Requirements Document

## Project Description (Input)

PWAのService Worker更新方式を現行の registerType: 'prompt' から 'autoUpdate' に変更し、SWキャッシュに古いフロントバンドルが残り続ける問題を構造的に解消する。

背景: onboarding機能は本番含めソースから完全削除済み(api.mosaku.jpで /onboarding/\* が404、削除デプロイ済みを2026-06-20に検証。証跡は `.kiro/specs/onboarding-removal/verification.md`)。だが prompt 方式ではユーザーが更新トースト(SwUpdatePrompt)を押さない限り削除前バンドルが waiting のまま居座り、削除済みUI(onboarding等)が表示され続ける。

対象:

- `frontend/src/utils/pwa/pwa-config.ts` の registerType
- `frontend/src/hooks/useSwRegistration.ts`
- `frontend/src/components/pwa/SwUpdatePrompt.tsx` の更新導線

要件の考慮点:

1. 新版検知時に自動で skipWaiting ＆リロードし、ユーザー操作ゼロで最新化する。
2. メモ/ノート編集中の自動保存(`useAutoSave`)が確実に効いた状態でリロードされ、未保存データを失わないこと。必要なら未保存変更があるときはリロードを遅延／確定後に実行するガードを設ける。
3. SWの一世代遅れ特性(既存の古いSWを掴むクライアントは次回取得→そのまた次から自動化)をどう扱うか。kill-switch的な一回限りの強制更新を併用するか許容するかを決める。
4. テーマCSSのCacheFirstランタイムキャッシュ(`mosaku-theme-css`)への副作用が無いこと。
5. prefers-reduced-motion／編集フォーカス等の既存エフェクト自動停止条件と、自動リロードのタイミングが衝突しないこと。

非対象:

- backend/DBの変更(onboarding削除は完了済み)
- キャッシュ戦略の全面再設計

## Requirements

<!-- Will be generated in /kiro:spec-requirements phase -->

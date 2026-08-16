# 健全性ゲート検証（2026-06-22）

## 結論

pwa-sw-auto-update の全実装タスク（1〜5）が完了し、Task 6 の健全性ゲートを**すべてパス**。
フロントエンドのビルド・型チェック・lint・テスト 988 件がエラーゼロで通過した。

## 健全性ゲート（Task 6.2 要件）

### ビルド・型チェック

```
npm run build → tsc -b && vite build

✓ TypeScript 型チェック エラー 0 件
✓ Vite ビルド完了（2524 modules transformed）
✓ PWA generateSW 完了（precache 19 entries / 1641.86 KiB）
```

### ESLint

```
npm run lint → バックエンド 0 errors / フロントエンド 0 errors
（warnings は既存の未解決 warnings のみ、新規エラーなし）
```

### テストスイート（フロントエンド）

```
Test Files  104 passed (104)
Tests       988 passed (988)
```

新規エラー・回帰なし。

### コード分割成果物の整合更新

`codeSplitVerification.test.ts` のテスト意図を実態に合わせて更新した：

- **変更前**: `useEditorFocusStore` と `useMoriEffectControl` の文字列がメインチャンクに含まれないことを検証
- **変更後（正確な意図）**:
  - `useEditorFocusStore`: `SwAutoUpdater → useGuardedAutoUpdate` 経由でメインチャンクに含まれることが **正常**（SW 自動更新オーケストレータの依存）
  - `useMoriEffectControl`: Vite がアセットマニフェストとして chunk ファイル名をメインバンドルに埋め込む（正常動作）。実装コードの分離は独立チャンクファイル `useMoriEffectControl-*.js` の**存在**で検証するよう修正

## 統合テスト（Task 6.1）

`useGuardedAutoUpdate.integration.test.ts` を新設し、実ストア連携を検証：

| シナリオ                                                | ケース数 | 結果 |
| ------------------------------------------------------- | -------- | ---- |
| 新版 waiting → saving → saved → 自動リロード（Req 6.2） | 4        | ✓    |
| フォーカス中は保留 → blur で flush（Req 2.2, 2.4）      | 2        | ✓    |
| updateAvailable=false なら一切リロードしない（Req 1.5） | 1        | ✓    |

- 実 `useSaveStatusStore`・実 `useEditorFocusStore` を使用（モックなし）
- `useSwRegistration` のみ mock（実 SW 不要）

## 本番検証（未実施）

本番デプロイは未実施のため、旧バンドル非表示の確認（Req 6.1）はデプロイ後に以下で確認予定：

1. 本番（mosaku.jp）に新バージョンをデプロイ
2. 既存タブで新版 SW が waiting に到達することを DevTools で確認
3. エディタ未使用・非フォーカス状態で自動リロードが発火することを確認
4. onboarding-removal で削除済み UI が表示されないことを確認

## 実装サマリー

| コンポーネント         | 変更種別                                              | Req カバレッジ                         |
| ---------------------- | ----------------------------------------------------- | -------------------------------------- |
| `useSaveStatusStore`   | 新設                                                  | 2.1, 2.3, 2.5                          |
| `useAutoSave`          | publish 副作用追加                                    | 2.6                                    |
| `useSwRegistration`    | 再設計（updateAvailable/applyUpdate + probe）         | 1.3, 3.2, 3.3, 4.3, 5.2, 5.5           |
| `useGuardedAutoUpdate` | 新設（ガード + one-shot + bounded escape + 不発検知） | 1.2, 1.5, 1.6, 2.2, 2.4, 2.7, 3.5, 6.5 |
| `SwAutoUpdater`        | 新設（headless マウント点）                           | 1.4, 5.1, 5.3                          |
| `SwUpdatePrompt`       | 削除                                                  | 5.1, 5.4                               |
| `App.tsx`              | SwUpdatePrompt → SwAutoUpdater 差し替え               | 5.4                                    |
| `pwa-config.test.ts`   | テスト意図改訂（registerType:'prompt' 契約）          | 1.1, 6.4                               |

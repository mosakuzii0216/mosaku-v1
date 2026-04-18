# Playwright 入門ガイド（Mosaku 向け）

このドキュメントは Mosaku プロジェクトで Playwright を使い始める人向けのハンズオンガイドです。

## 目次

- [Playwright とは](#playwright-とは)
- [テストピラミッドでの位置づけ](#テストピラミッドでの位置づけ)
- [Backend に Playwright は必要？](#backend-に-playwright-は必要)
- [現状のプロジェクト構成](#現状のプロジェクト構成)
- [ハンズオン](#ハンズオン)
  - [1. UI モード体験](#1-ui-モード体験)
  - [2. codegen で自動生成](#2-codegen-で自動生成)
  - [3. Trace Viewer でデバッグ](#3-trace-viewer-でデバッグ)
  - [4. 既存テストを読み解く](#4-既存テストを読み解く)
- [おすすめハンズオン順](#おすすめハンズオン順)
- [次のステップ](#次のステップ)

---

## Playwright とは

**本質はブラウザ自動化ツール**。Microsoft が OSS で開発している E2E テストフレームワーク。

Chromium / Firefox / WebKit をコードから操作して「ユーザーがブラウザでポチポチする動き」を完全に再現できる。Selenium の後継ポジション。

## テストピラミッドでの位置づけ

```
        /\
       /E2E\        ← ユーザー視点。全部繋がってる？ ← Playwright
      /------\
     /統合テスト\   ← API+DB通して動く？ ← supertest (backend)
    /----------\
   /ユニットテスト\ ← 関数単体で正しい？ ← Jest / Vitest
  /--------------\
```

Jest が「部品が正しい」を保証しても、**「ユーザーが実際に使えるか」は別問題**。
ログインボタン押したらちゃんとダッシュボード行く？みたいな検証は E2E の領域。

## Backend に Playwright は必要？

**基本的に不要**。

Backend（NestJS）には既に以下が導入済み：

- `jest` + `supertest`（`backend/test/app.e2e-spec.ts`）
- NestJS Testing Module

`supertest` は HTTP リクエストをコードから叩けるツール。「POST /auth/login に `{email, password}` 送ったら 200 返る？」というテストが書ける。これが **backend にとっての E2E**。

Playwright にも `request` fixture という API を叩く機能はあるが、backend 単体テストなら supertest で十分。

### 「全体に導入」が意味するもの

Playwright の真価は **本物の frontend + 本物の backend + 本物の DB を繋げた統合テスト**。
現状の frontend E2E は backend をモックしているため、**モック想定と実装がズレたら気づけない**のが弱点。

目指す構成：

```
┌─────────────────────────────────────────────┐
│ Playwright (frontend/e2e)                   │
│  ├─ 既存: モックE2E（高速・ユニット的）      │
│  └─ 追加: 本物E2E（docker-compose起動）      │
├─────────────────────────────────────────────┤
│ Jest + supertest (backend/test)             │
│  └─ API単体のE2E（既存維持）                 │
├─────────────────────────────────────────────┤
│ Jest (backend/src), Vitest (frontend/src)   │
│  └─ ユニットテスト                            │
└─────────────────────────────────────────────┘
```

## 現状のプロジェクト構成

| 項目               | 値                                     |
| ------------------ | -------------------------------------- |
| バージョン         | `@playwright/test` v1.59.1             |
| 設定ファイル       | `frontend/playwright.config.ts`        |
| テストディレクトリ | `frontend/e2e/`                        |
| ブラウザ           | Chromium のみ                          |
| baseURL            | `http://localhost:5173`                |
| webServer          | `npm run dev` を自動起動               |
| trace              | `on-first-retry`（リトライ時のみ取得） |

### 既存テストファイル

- `frontend/e2e/auth-flow.spec.ts` — 認証フロー
- `frontend/e2e/performance.spec.ts` — パフォーマンス検証

### 実行コマンド

```bash
cd frontend
npm run test:e2e        # ヘッドレス実行
npm run test:e2e:ui     # UI モード（推奨）
```

---

## ハンズオン

### 1. UI モード体験

まず触って楽しさを体感するのが一番！

```bash
cd frontend
npm run test:e2e:ui
```

このコマンドで：

- `playwright.config.ts` の `webServer` 設定により `npm run dev` が裏で自動起動
- 専用 UI ウィンドウが起動

#### UI モードでできること

| 機能              | できること                                            |
| ----------------- | ----------------------------------------------------- |
| ▶️ 個別実行       | テストを 1 つずつ選んで走らせる                       |
| 👁️ Watch mode     | ファイル保存するたび自動再実行                        |
| 🎬 Timeline       | 各ステップの前後の DOM スナップショットを行き来できる |
| 🔍 Locator picker | 画面上の要素をクリック → 対応するコード提案           |
| 📡 Network        | API リクエスト / レスポンスを全部見れる               |
| 📋 Console        | ブラウザの console.log も見れる                       |

#### 最初にやってみること

1. UI モード起動
2. 左ペインから `auth-flow.spec.ts` → 「ログインフォームが表示されること」を選択
3. ▶️ ボタンで実行
4. **Timeline（下部）のステップをクリック** → DOM が当時の状態に戻る（タイムトラベル）

---

### 2. codegen で自動生成

「テスト書くのめんどい」を解決するやつ。操作をブラウザで記録してコード化してくれる。

#### 事前準備

別タブで dev サーバーを起動：

```bash
cd frontend
npm run dev
```

#### codegen 実行

```bash
cd frontend
npx playwright codegen http://localhost:5173
```

起動すると：

- ブラウザが自動で開く
- 右側に「Playwright Inspector」が表示
- **ブラウザをポチポチすると、右側にコードが勝手に書かれていく**

#### 試してほしい操作

1. メール入力欄クリック → 何か入力
2. パスワード入力欄に入力
3. 「新規登録」等のボタンをクリック
4. 右側を見る → テストコードが生成されている

生成されたコードをコピーして、新しいファイル（例: `frontend/e2e/my-first-test.spec.ts`）に貼り付ければすぐテストとして動く。

> **使いどころのコツ**: codegen は骨組み生成マシン。生成後に `expect(...)` でアサーションを追加したり、重複を整理するのが正しい使い方。

---

### 3. Trace Viewer でデバッグ

#### Trace とは

テスト実行中の**全情報（スクショ / DOM / ネットワーク / ログ）を 1 ファイル**にパッケージしたもの。
CI で落ちた時、これがあれば**ローカル再現なしに原因がわかる**。

#### 全テストで trace を生成する

```bash
cd frontend
npx playwright test auth-flow.spec.ts --trace on
```

`--trace on` を付けると成功・失敗問わず全テストの trace を保存。

#### trace を見る

```bash
npx playwright show-report
```

HTML レポートが開く → 各テストをクリック → 「Trace」タブで動画 + タイムトラベル UI。

#### 現状の設定

`frontend/playwright.config.ts:12` に `trace: 'on-first-retry'` と設定されている。
これは「リトライ時だけ trace を取る」設定で、CI の無駄なストレージ消費を避ける合理的な選択。

---

### 4. 既存テストを読み解く

`frontend/e2e/auth-flow.spec.ts:4-12` に面白い書き方がある：

```typescript
test.beforeEach(async ({ page }) => {
	await page.route('**/api/auth/me', (route) => {
		route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
	});
});
```

これは **Playwright のネットワークインターセプト機能**。MSW 等の別ツールは不要。

**仕組み**: `page.route(URLパターン, ハンドラ)` でリクエストを横取りして任意のレスポンスを返す。
→ **backend なしで frontend の E2E が動く理由はこれ**。

#### 注目ポイント

| コード                                             | 何をしている？                                         |
| -------------------------------------------------- | ------------------------------------------------------ |
| `page.locator('input[type="email"]')`              | CSS セレクタで要素取得                                 |
| `page.getByRole('button', { name: /.../ })`        | **アクセシビリティロールで取得**（推奨）               |
| `await expect(...).toBeVisible()`                  | **自動リトライ付きアサーション**（要素が出るまで待つ） |
| `page.evaluate(() => sessionStorage.setItem(...))` | ブラウザ内で JS 実行                                   |

> `getByRole` が推奨される理由: スクリーンリーダーと同じ取得方法 = アクセシビリティ的に正しい実装を強制できる。

---

## おすすめハンズオン順

1. `npm run test:e2e:ui` で全テストを眺める（10 分）
2. 1 つのテストを選んで Timeline で遊ぶ（5 分）
3. codegen でログイン操作を記録してみる（10 分）
4. 生成コードを `frontend/e2e/sandbox.spec.ts` 等に保存して走らせる（5 分）

---

## 次のステップ

ハンズオンで基礎が掴めたら、次は **本物 E2E 構成** に挑戦：

- `docker-compose up` で全サービス起動
- Playwright がモックなしで本物の backend / DB にアクセス
- 新規ディレクトリ `frontend/e2e/integration/` を作成
- フロント・バック・DB 統合でのシナリオテストを記述

これにより「モックと実装のズレ」という E2E 最大の弱点を解消できる。

## Playwright の主な強み

1. **`codegen` でテスト自動生成** — `npx playwright codegen <URL>` で操作を記録してコード化
2. **`--ui` モードでタイムトラベルデバッグ** — 失敗したステップを動画で巻き戻せる
3. **自動待機** — `await expect(...)` が要素が出るまで勝手に待つ（Selenium の `sleep` 地獄からの解放）
4. **Trace Viewer** — CI 失敗時にスクショ + DOM + ネットワークログを全部確認できる
5. **マルチブラウザ** — Chrome / Firefox / Safari を同じコードで検証可能

## 参考リンク

- [Playwright 公式ドキュメント](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Locators ガイド](https://playwright.dev/docs/locators)

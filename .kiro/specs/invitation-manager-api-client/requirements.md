# Requirements Document

## Project Description (Input)

InvitationManager の fetch 直呼び出しを apiClient に統一する

## 現状分析

`InvitationManager.tsx` はすでに `apiClient` を使用しており、元々の問題は解消済み。
ただし、フロントエンドには同様の `fetch` 直呼び出しの不整合が残っている：

1. **`utils/api.ts`（ApiClient 内部）**: `verifyInvitationCode()` メソッドが内部の `this.request()` ではなく生の `fetch` を使用している
2. **`utils/auth.ts`（AuthAPI クラス）**: `login()`・`register()`・`resetPassword()`・`*RegisterWithInvitation()` メソッドが、同クラス内の `makeRequest()` ヘルパーではなく生の `fetch` を直接呼び出しており、内部実装が一貫していない

このスペックでは上記の残存不整合を修正し、フロントエンド全体で「`fetch` 直呼び出し禁止・`apiClient` 経由で統一」の方針を完全に実現する。

## Requirements

### 1. ApiClient 内部の fetch 直呼び出しを排除する

**Objective:** As a 開発者, I want `ApiClient` クラスの全メソッドが内部の `request()` ヘルパーを通じて通信する, so that API コールのエラー処理・認証ヘッダー付与ロジックが一元化される

#### Acceptance Criteria

1. The ApiClient shall call `verifyInvitationCode()` through the internal `this.requestPublic()` helper instead of raw `fetch`.
2. When `verifyInvitationCode()` receives a non-OK HTTP response, the ApiClient shall throw an error with a descriptive message（現在の詳細なエラーハンドリングロジックを維持する）.
3. The ApiClient shall not contain any direct `fetch()` calls outside of the central `request()` method.

---

### 2. AuthAPI クラスの内部 fetch 直呼び出しを makeRequest に統一する

**Objective:** As a 開発者, I want `AuthAPI` クラスの全 API 呼び出しが `makeRequest()` ヘルパーを経由する, so that 認証ヘッダーの付与ロジックが一箇所に集約され、重複コードが排除される

#### Acceptance Criteria

1. When `AuthAPI.login()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
2. When `AuthAPI.register()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
3. When `AuthAPI.resetPassword()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
4. When `AuthAPI.googleRegisterWithInvitation()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
5. When `AuthAPI.githubRegisterWithInvitation()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
6. When `AuthAPI.lineRegisterWithInvitation()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
7. When `AuthAPI.appleRegisterWithInvitation()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
8. When `AuthAPI.xRegisterWithInvitation()` is called, the AuthAPI shall use `makeRequest()` for the HTTP request instead of calling `fetch()` directly.
9. The AuthAPI shall not contain any direct `fetch()` calls outside of `makeRequest()`.

---

### 3. 既存の動作を維持する

**Objective:** As a ユーザー, I want ログイン・登録・OAuth フローが修正前と同じ動作をする, so that リファクタリングによってユーザー体験が変化しない

#### Acceptance Criteria

1. When `AuthAPI.login()` succeeds, the AuthAPI shall store the access token via `AuthTokenManager.setAccessToken()` as before.
2. When `AuthAPI.*RegisterWithInvitation()` succeeds, the AuthAPI shall store the access token via `AuthTokenManager.setAccessToken()` as before.
3. If any auth API call returns a non-OK HTTP response, the AuthAPI shall throw an Error with the same error message format as before.
4. The AuthAPI shall preserve the existing method signatures（引数・戻り値の型）without any changes.
5. When `verifyInvitationCode()` succeeds, the ApiClient shall return `InvitationVerificationResponse` as before.
6. If `verifyInvitationCode()` receives an error response, the ApiClient shall throw an error with a descriptive message derived from the response body or status.

---

### 4. fetch 直呼び出し禁止ルールを遵守する

**Objective:** As a 開発者, I want フロントエンドの API 通信が `apiClient` または `AuthAPI.makeRequest()` を経由する, so that steering ドキュメントの「fetch 直呼び出し禁止」方針が完全に実現される

#### Acceptance Criteria

1. The frontend shall not contain any `fetch()` calls in application code outside of `utils/api.ts` and `utils/auth.ts`.
2. The `utils/api.ts` shall not contain `fetch()` calls outside of `ApiClient.request()`.
3. The `utils/auth.ts` shall not contain `fetch()` calls outside of `AuthAPI.makeRequest()`.
4. Where a CSS file is fetched for theme loading (`useThemeCSS.ts`, `themeLoader.ts`), the frontend shall use `fetch()` directly as these are static asset loads, not API calls（この用途は例外として認める）.

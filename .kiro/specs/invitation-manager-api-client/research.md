# Research & Design Decisions

---

## Summary

- **Feature**: `invitation-manager-api-client`
- **Discovery Scope**: Extension（既存コードのリファクタリング）
- **Key Findings**:
  - `InvitationManager.tsx` はすでに `apiClient` を使用済み。残存問題は `utils/api.ts` と `utils/auth.ts` の内部実装にある
  - `ApiClient.request()` の基底エラー処理が `HTTP error! status: N` という汎用メッセージしか返さないため、`verifyInvitationCode` が生 `fetch` を使って独自の詳細エラー処理を実装していた
  - `AuthAPI.makeRequest()` は既にトークン付与・Content-Type 設定を担う汎用ヘルパーとして存在しており、8メソッドが利用していないのはコードの一貫性問題

## Research Log

### ApiClient.request() のエラーハンドリング調査

- **Context**: `verifyInvitationCode()` が `requestPublic()` を使えない理由を調査
- **Findings**:
  - 現在の `request()` は `!response.ok` 時に `throw new Error(\`HTTP error! status: ${response.status}\`)` という汎用メッセージを投げる
  - `verifyInvitationCode()` はサーバーの JSON レスポンスから `error.message` を取り出して `throw` しており、招待コード検証エラーをユーザーに分かりやすく伝えていた
  - `requestPublic()` は `request()` の薄いラッパーなので同じ問題を抱える
- **Implications**: `request()` 自体を JSON エラーメッセージ抽出対応に強化することで、全 API 呼び出しのエラー品質を向上させつつ `verifyInvitationCode()` を `requestPublic()` に移行できる

### AuthAPI.makeRequest() の使用実態調査

- **Context**: なぜ一部メソッドが `makeRequest()` を使い、他が生 `fetch` を使っているか
- **Findings**:
  - `makeRequest()` はトークンが存在して有効な場合のみ `Authorization` ヘッダーを付与する（存在しない場合は無視）
  - `login`, `register`, `resetPassword` は認証前フローなのでトークンは存在しないが、`makeRequest()` を使っても安全（ヘッダーが付かないだけ）
  - `*RegisterWithInvitation` 系も同様にトークン不要
  - 生 `fetch` を使うメソッドは `makeRequest()` と全く同じ設定（Content-Type: application/json）をコピーしており、二重管理になっている
- **Implications**: `makeRequest()` に統一することでヘッダー設定の一元化が実現する。動作変化は一切ない

## Architecture Pattern Evaluation

| Option                                    | Description                                                                                                      | Strengths                                         | Risks / Limitations                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **request() 強化 + requestPublic() 移行** | `request()` の `!response.ok` 処理で JSON エラー抽出を試みる。`verifyInvitationCode` は `requestPublic()` に移行 | 全 API 呼び出しのエラー品質が向上。コードの一貫性 | `request()` の動作変更がすべての呼び出し元に影響するが、エラーメッセージが「より詳細になる」変更なので破壊的ではない |
| verifyInvitationCode に特別扱いを維持     | `request()` は変更せず、`verifyInvitationCode` だけ特例として生 `fetch` を許容                                   | 変更範囲が最小                                    | 「fetch 直呼び出し禁止」ルールへの例外を維持し続ける。要件 1.3 に違反                                                |

**採用**: Option 1（request() 強化 + requestPublic() 移行）

## Design Decisions

### Decision: `ApiClient.request()` の JSON エラーメッセージ抽出対応

- **Context**: `verifyInvitationCode()` が `requestPublic()` を使えない理由が基底メソッドの汎用エラーにある
- **Alternatives Considered**:
  1. `request()` を強化して JSON エラー抽出を追加（全呼び出し元に恩恵）
  2. `verifyInvitationCode` のみ例外として生 `fetch` を維持
- **Selected Approach**: `request()` の `!response.ok` ブロックに JSON エラー抽出ロジックを追加。`Content-Type: application/json` の場合は `error.message` を取り出し、失敗した場合は `HTTP error! status: N` にフォールバックする
- **Rationale**: 既存のエラー品質を維持しつつ一貫性を実現。他の API 呼び出しも同様に恩恵を受ける
- **Trade-offs**: `request()` の変更範囲が広いが、エラーメッセージは「よりよくなる」方向の変更なので既存動作への破壊的影響はない

### Decision: AuthAPI の login/register 系も makeRequest() を使用

- **Context**: 認証前フローでトークンが不要なため生 `fetch` を使っていた
- **Selected Approach**: `makeRequest()` に統一する。`makeRequest()` はトークンがない場合も正常動作するため安全
- **Rationale**: ヘッダー設定の二重管理を解消し、将来的なヘッダー変更が `makeRequest()` 一箇所で済む
- **Trade-offs**: なし（動作変化なし）

## Risks & Mitigations

- `request()` の変更が全 API 呼び出しに影響する — エラーメッセージが「よりよくなる」変更であり破壊的ではないが、実装後に全エンドポイントの動作確認が必要
- `AuthAPI` の token 設定タイミング（`setAccessToken`）が維持されることを確認する — `makeRequest()` は `Response` オブジェクトを返すため、呼び出し元で引き続きトークン設定が必要。設計上問題なし

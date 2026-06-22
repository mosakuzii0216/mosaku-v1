# Requirements Document

## Project Description (Input)

OAuth フローの完全 stateless 化・5プロバイダ統一。現状 X(Twitter) だけ passport の state:true/pkce:true による express-session(cookie-session) 依存で、controller に X 専用の例外分岐が残っている（oauth-session-durability=案b で不具合と多インスタンス耐性は解消済み・implementation-validated）。本 spec はその上で、X も他4社(Google/GitHub/LINE/Apple)と同じ HMAC 署名 state 方式へ寄せ、PKCE の code_verifier を暗号化して署名 state に載せて持ち回ることで express-session/cookie-session 自体を全廃する内部リファクタ(gap分析の案a)。メリット: 5社が1フローに統一、controller の X 例外分岐が消える、session(MemoryStore/cookie-session/pgストア)を全廃、将来プロバイダ追加が1パターンになる。注意点: S256 生成＋verifier の AES-GCM 等での暗号化＋鍵管理という自前 crypto が新規実装になる（現 InvitationStateService は HMAC 署名のみ）。ユーザー影響のある不具合修正ではなく内部リファクタなので、durability の安定稼働を前提とする。

## Requirements

<!-- Will be generated in /kiro:spec-requirements phase -->

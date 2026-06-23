# Implementation Plan

## invitation-perks

> 本 spec は課金ウォレット基盤に非依存な**独立部**（特典属性・人数キャンペーン・登録 UX）のみを対象とする。COMP 適用本体は後続 spec。backend（Task 2〜4）と frontend（Task 5）は design 契約を固定した上で並行トラックとして進め、Task 6 で統合する。

---

- [ ] 1. perk スキーマ・縮退フラグ・共有定数を整備する（Phase 1 基盤 / 既存挙動不変）
- [ ] 1.1 (P) 招待コードに perk 属性を直付けする
  - `InvitationPerkType` enum（`NONE` / `COMP`）を Prisma スキーマに追加する
  - `InvitationCode` に `perkType`（`@default(NONE)`）と `perkCompMonths`（nullable Int）を追加する
  - enum 追加 + 2 カラム追加のマイグレーションを 1 本作成し、既存行が `NONE` に吸収される（後方互換）ことを確認する
  - スキーマ変更後に `prisma generate` を実行して生成型を更新する
  - 種別テーブル・階層参照は導入せず最小構造に保つ
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 1.2 (P) COMP 縮退フラグを設定基盤に追加する
  - `ConfigService` に `compPerkEnabled`（env `COMP_PERK_ENABLED`・既定 false）の getter を新設する
  - `.env.example` に `COMP_PERK_ENABLED` の用途（COMP 縮退ゲート・既定 OFF）を追記する
  - 既定で false に解決され、明示 true で true になることをユニットテストで固定する
  - 1.1 とは別ファイルのため並行実装可
  - _Requirements: 2.2_

- [ ] 1.3 (P) キャンペーン上限の共有定数を定義する
  - `invitation` ドメインに `MAX_CAMPAIGN_MAX_USES`（目安 20）と `MAX_ACTIVE_INVITE_CODES`（目安 3）を定数として定義する
  - フロントの人数上限メッセージに再利用できる「backend と同期」する共有値として公開する
  - 1.1 / 1.2 とは別ファイルのため並行実装可
  - _Requirements: 3.3_

---

- [ ] 2. COMP 縮退ゲートと検証応答の perk 露出を実装する（Phase 2 backend / 縮退・検証）
- [ ] 2.1 COMP 縮退ゲート `PerkGate.resolvePerk` を実装する
  - `resolvePerk(invitation)` を実装し、`COMP_PERK_ENABLED` が false の間は常に `{ type: 'none' }` を返す
  - フラグ ON かつ `perkType=COMP` のとき `{ type: 'comp', months }` を返し、`perkCompMonths` が不正（1〜3 外・欠落）なら `none` へフォールバックして Sentry に警告（`feature_area: invitation`）を残す
  - 公開メソッドは `resolvePerk` のみとし、適用系（`applyPerk`）を持たないことを回帰テストで固定する（適用本体は後続 spec）
  - フラグ OFF→none / ON+COMP→comp / ON+不正months→none の 3 経路をユニットテストで固定する
  - スキーマ enum（1.1）と縮退フラグ（1.2）に依存するため Task 1 完了後に実施する
  - _Requirements: 2.1, 2.2, 2.3, 5.3_

- [ ] 2.2 検証結果に perk を載せる
  - `InvitationService.verifyInvitation` の戻り値 `InvitationContext` に `perk` を追加し、`PerkGate.resolvePerk` の結果を反映する
  - 露出するのは「コードの属性（種別・月数）」のみとし、ユーザーの課金状態は一切返さない
  - フラグ OFF で perk が `{ type: 'none' }` になることをユニットテストで固定する
  - 2.1 完了後に実施する（`PerkGate` に依存）
  - _Requirements: 4.1, 2.2, 5.4_

- [ ] 2.3 `verify-context` 応答に perk を追加する
  - `verify-context` の応答 `InvitationContextResponse` に `perk` を含め、context を返すシリアライザに写像する
  - フラグ OFF で `{ type:'none' }`、ON + COMP コードで `{ type:'comp', months }` が返ることを確認する
  - 2.2 完了後に実施する（service が perk を返す前提）
  - _Requirements: 4.1_

- [ ] 2.4 旧 verify API の生 row 露出を塞ぐ
  - `POST /invitation/verify`（旧 API）を生 Prisma row 返却から専用シリアライザ経由へ変更し、`perkType` / `perkCompMonths` / `createdById` を応答から除外する
  - perk の露出口を `verify-context`（`PerkGate` 経由）に一本化する
  - COMP コードでも旧 verify 応答に perk / `createdById` が含まれないことをテストで固定する
  - 2.3 と同じ controller を変更するため逐次実施する
  - _Requirements: 2.2, 5.4_

---

- [ ] 3. 人数キャンペーン発行と ADMIN COMP 発行を実装する（Phase 2 backend / 発行）
- [ ] 3.1 (P) キャンペーン発行入力の検証を追加する
  - `CreateMyInvitationDto` に `maxUses?`（既定 1）を受け、`@IsInt() @Min(1) @Max(MAX_CAMPAIGN_MAX_USES)` で範囲検証する
  - 上限超過は `VALIDATION.INVALID_INPUT`（400）で表現し、専用 INV コードは追加しない
  - `maxUses` の 0 / 上限超過 / 範囲内の 3 ケースをユニットテストで固定する
  - DTO 単体ファイルのため Task 2 と並行実装可（定数は 1.3 に依存）
  - _Requirements: 3.1, 3.3, 3.4_

- [ ] 3.2 一般ユーザーのキャンペーン発行を `maxUses` 可変＋同時有効数ガードへ拡張する
  - `createForUser(actor, { maxUses })` に拡張し、`maxUses` を発行コードへ反映する（既定 1・`perkType` は NONE 固定で COMP 発行不可）
  - トランザクション内で USER の有効コード数（未失効かつ `usedCount < maxUses`）を数え、`MAX_ACTIVE_INVITE_CODES` 到達なら発行拒否する（ADMIN は対象外）
  - quota 消費は既存 `PrismaQuotaPolicy`（生涯発行総数）を流用し、`usedCount`/`maxUses` 到達時の追加登録拒否は既存ロジックのまま維持する
  - 既存の引数なし呼び出し（`createForUser(actor)`）の後方互換を保つ
  - `maxUses` 反映・NONE 固定・quota 1 減算（USER）/不変（ADMIN）・同時有効数到達で拒否（USER）・ADMIN 無制約 をユニットテストで固定する
  - 課金ウォレット基盤に依存せず既存招待基盤のみで成立させる
  - 1.1 / 1.3 完了後に実施する
  - _Requirements: 3.1, 3.3, 3.5, 3.6, 5.5_

- [ ] 3.3 ADMIN の COMP 発行 passthrough を追加する
  - `CreateInvitationDto`（ADMIN）に `perkType?`（既定 `NONE`）/ `perkCompMonths?` を追加し、`perkType=COMP` のとき `perkCompMonths` を `@Min(1) @Max(3)` で必須化（`@ValidateIf`）、`NONE` のとき欠落させる
  - `createInvitation(dto, adminId)` で perk を `create` データへ反映し、COMP コードの唯一の生成元とする（サービス層で `COMP→months 1〜3 必須 / NONE→null` を再保証）
  - ADMIN の COMP 発行を Sentry breadcrumb（`feature_area: invitation`）で記録する
  - `COMP`+months 未指定→400 / `COMP`+months 4→400 / `COMP`+months 1〜3→OK / `NONE`+months 指定→400 をユニットテストで固定する
  - 3.2 と同じ service を変更するため 3.2 完了後に実施する
  - _Requirements: 1.1, 1.2_

- [ ] 3.4 発行ハンドラを配線する
  - `POST /invitation/me`（JWT 既定保護・未認証 401）で `dto.maxUses` を `createForUser` に渡す
  - `POST /invitation`（ADMIN・`AdminGuard`）で perk 入り `dto` を `createInvitation` に渡す
  - 上限超過 `INVALID_INPUT` / quota 枯渇 `QUOTA_EXHAUSTED` / 同時有効数超過の理由文言（「同時に有効な招待コードは最大 N 個までです」等）を返す
  - 2.3 / 2.4 と同じ controller を変更するため Task 2 完了後に実施する
  - _Requirements: 3.2, 3.4_

---

- [ ] 4. 登録フローに前方互換 seam を置く（Phase 2 backend / 適用は後続 spec）
- [ ] 4.1 登録フローに適用 seam を明示する（配線しない）
  - `AuthService.register` / `OAuthService.consumeAndIssue` の招待消費直後に差し込み点コメント（`// TODO(comp-perk-apply): 後続 spec で PerkGate.applyPerk を配線`）を 1 箇所ずつ置く
  - 本 spec では登録フローを perk 非参照のまま改変せず、`applyPerk` / `PerkApplier` を定義・配線しない（COMP 正典準拠の適用は後続 spec が既存ウォレット・天井ガードを再利用する余地として残す）
  - _Requirements: 2.3, 2.4, 5.1, 5.2_

- [ ] 4.2 前方互換縮退を統合テストで担保する
  - email / OAuth のいずれでも COMP 特典付きコードで登録が成立し、登録フローが perk を適用しない（`PerkGate` の適用系を呼ばない）ことをテストする
  - 課金カラムは未実装のため書き込み対象が存在しないこと、ユーザーへ特典適用済みと示さないことを確認する
  - 1.1 完了後（COMP コードをテスト準備で作成可能）に実施する
  - _Requirements: 2.1, 5.2_

---

- [ ] 5. 登録 UX を作り直し特典価値を可視化する（Phase 3 frontend / backend と並行トラック）
- [ ] 5.1 (P) perk 型と上限値をフロントへ同期する
  - `types/invitation.ts` の `InvitationContextResponse` に `perk`（`InvitationPerkView` = `{ type:'none' } | { type:'comp', months }`）を追加し、backend enum と同期する（「backend と同期」コメント付与）
  - 人数上限メッセージ用に `MAX_CAMPAIGN_MAX_USES` 等の上限値をフロントから参照できるようにする
  - design 契約に対して実装するため backend Task 2〜4 と並行実装可
  - _Requirements: 4.1_

- [ ] 5.2 (P) 特典バッジ `PerkBadge` を実装する
  - `InvitationPerkView` を受け、`comp` のとき「🎁 AI 無料枠つき（N ヶ月）」等のバッジを描画する
  - `none`（特典未構成・フラグ OFF）のときは何も描画しない
  - 金額・課金状態・内部コストは受け取らず、種別と月数のみから文言を導出する
  - comp 表示 / none 非表示のレンダリングをユニットテストで固定する
  - 5.1 の型に依存。AuthForm 改修とは独立のため並行実装可
  - _Requirements: 4.3, 4.6_

- [ ] 5.3 `InvitePage` / `AuthForm` を作り直す
  - 招待コードを適用済みとして読み取り専用提示し、編集 input を既定で出さない
  - 既にアカウントを持つユーザー向けにログイン導線（login モード切替）を追加する
  - 認証手段を整理し、主要な少数（例: メール + Google）を既定表示、残り（GitHub / LINE / Apple / X）は「他の方法で登録」展開の先に配置する
  - 取得した context の `perk` を `PerkBadge` に渡し招待者名の近傍に配置する。`perk` 不在（特典なし）でもレイアウトが破綻しないこと
  - 既存 `AuthForm.newflow.test.tsx` / `EmailAuthForm.newflow.test.tsx` を改修に追従させる
  - 5.1 / 5.2 完了後に実施する
  - _Requirements: 4.2, 4.4, 4.5, 4.6_

---

- [ ] 6. 統合・E2E で検証する（Phase 4 検証）
- [ ] 6.1 発行・検証・縮退の API 統合テストを実施する
  - `POST /invitation/me`: `maxUses` 複数で複数人コード発行・quota 減算、`maxUses: 0`→400、未認証→401 を検証する
  - 同時有効数: USER が `MAX_ACTIVE_INVITE_CODES` 保持中の追加発行→400、1 個使い切り/失効後は再発行可、ADMIN は無制約 を検証する
  - `POST /invitation`（ADMIN）: `perkType=COMP, perkCompMonths=3`→成功 / `perkCompMonths=12`→400 / 非 ADMIN→403 を検証する
  - 旧 `POST /invitation/verify`: COMP コードでも `perkType` / `perkCompMonths` / `createdById` が応答に含まれない（漏洩リグレッション）を検証する
  - `POST /invitation/verify-context`: フラグ OFF で `perk:{type:'none'}`、ON + COMP で `perk:{type:'comp', months}` を検証する
  - Task 2〜4 完了後に実施する
  - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 2.2_

- [ ]\* 6.2 登録 UX を E2E 検証する
  - 特典なしコードの `/invite/:code` でバッジ非表示・適用済みコード提示・ログイン導線・主要手段＋展開が表示されることを検証する
  - 認証手段の展開操作で残りプロバイダが現れることを検証する
  - 既存ユーザーがログイン導線から login モードへ遷移できることを検証する
  - 特典ありコードで `PerkBadge` が表示されることを検証する
  - core 実装（Task 5）で受入基準は満たされるため、MVP 後に着手可能な任意のテスト拡充とする
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

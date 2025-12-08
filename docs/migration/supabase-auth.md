# Supabase Auth 段階的移行計画

既存の認証システムを壊さずに、安全にSupabase Authへ移行するための段階的な計画です。

## 📋 移行の全体フロー

```
フェーズ1: 準備・セットアップ
  ↓
フェーズ2: Supabase Auth実装（既存と並行）
  ↓
フェーズ3: 動作確認・テスト
  ↓
フェーズ4: 段階的な切り替え
  ↓
フェーズ5: 旧認証コードの削除
```

---

## 🎯 フェーズ1: 準備・セットアップ（1日目）

### タスク1.1: Supabaseプロジェクトのセットアップ
**目的**: Supabase環境を準備

```bash
# 作業内容
1. Supabaseダッシュボードでプロジェクト作成
2. Authenticationプロバイダーを有効化（Email, Google, GitHub）
3. 接続情報を取得
   - Project URL
   - anon/public key
   - Database connection string (with pooling)
```

**環境変数を追加** (.env に追加、既存の設定は残す):
```bash
# Supabase Settings (新規追加、既存のものと重複しないように注意)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx  # サーバーサイド用（重要）
```

**成果物**:
- ✅ Supabaseプロジェクトが作成済み
- ✅ 環境変数が設定済み
- ✅ OAuth プロバイダーが有効化済み

---

### タスク1.2: データベーススキーマの準備
**目的**: Supabase Auth用のスキーマを追加（既存スキーマは維持）

**Prismaスキーマの変更** (`backend/prisma/schema.prisma`):
```prisma
model User {
  id          String   @id @default(uuid())  // CUIDからUUIDに変更

  // 既存の認証フィールド（まだ削除しない）
  oauthId     String?  @unique @map("oauth_id")
  email       String   @unique
  password    String?

  // Supabase Auth用の新フィールド（追加）
  supabaseUserId String? @unique @map("supabase_user_id")

  name        String?
  role        UserRole @default(FREE)

  // 既存の認証関連フィールド（まだ削除しない）
  emailVerified        Boolean   @default(false) @map("email_verified")
  emailVerificationToken String? @map("email_verification_token")
  resetPasswordToken     String? @map("reset_password_token")
  resetPasswordExpires   DateTime? @map("reset_password_expires")

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memos             Memo[]
  tags              Tag[]
  notebooks         Notebook[]
  createdInviteCodes InvitationCode[]
  createdThemes     Theme[]
  favoriteThemes    UserFavoriteTheme[]

  @@map("users")
}
```

**マイグレーション実行**:
```bash
cd backend
npx prisma migrate dev --name add_supabase_user_id
npx prisma generate
```

**Supabase Database Trigger作成**:

Supabase SQL Editorで以下を実行（auth.usersと同期）:

```sql
-- public.usersにプロファイルを自動作成する関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (
    id,
    supabase_user_id,
    email,
    name,
    role,
    email_verified,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'FREE',
    NEW.email_confirmed_at IS NOT NULL,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO NOTHING;  -- 既存ユーザーがいる場合はスキップ
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーを作成
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**成果物**:
- ✅ `supabaseUserId`カラムが追加済み
- ✅ Supabaseトリガーが設定済み
- ✅ 既存データは保持されている

---

### タスク1.3: 依存関係のインストール
**目的**: Supabase SDKを追加

```bash
# バックエンド
cd backend
npm install @supabase/supabase-js

# フロントエンド
cd ../frontend
npm install @supabase/supabase-js
```

**成果物**:
- ✅ `@supabase/supabase-js`がインストール済み

---

## 🔧 フェーズ2: Supabase Auth実装（既存と並行）（2-3日目）

### タスク2.1: バックエンド - Supabaseサービスの作成
**目的**: Supabaseクライアントを作成（既存のAuthServiceは維持）

**新規ファイル作成**: `backend/src/supabase/supabase.module.ts`
```typescript
import { Module, Global } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
```

**新規ファイル作成**: `backend/src/supabase/supabase.service.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '../config/config.service';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.supabaseUrl,
      this.configService.supabaseAnonKey,
    );
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  async verifyToken(token: string) {
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error) throw error;
    return data.user;
  }
}
```

**ConfigServiceに追加** (`backend/src/config/config.service.ts`):
```typescript
// Supabase設定（既存のメソッドに追加）
get supabaseUrl(): string {
  return process.env.SUPABASE_URL || '';
}

get supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || '';
}
```

**AppModuleに追加** (`backend/src/app.module.ts`):
```typescript
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,  // 追加
    // ... 既存のモジュール
  ],
})
export class AppModule {}
```

**成果物**:
- ✅ `SupabaseModule`と`SupabaseService`が作成済み
- ✅ AppModuleに統合済み
- ✅ 既存のAuthModuleは影響を受けていない

---

### タスク2.2: バックエンド - Supabase認証ガードの作成
**目的**: Supabase用の認証ガードを作成（既存のJwtAuthGuardと並行）

**新規ファイル作成**: `backend/src/auth/supabase-auth.guard.ts`
```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private supabaseService: SupabaseService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() デコレータチェック
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.substring(7);

    try {
      // Supabaseでトークン検証
      const supabaseUser = await this.supabaseService.verifyToken(token);

      // public.usersからユーザー情報を取得
      const user = await this.prisma.user.findUnique({
        where: { supabaseUserId: supabaseUser.id },
      });

      if (!user) {
        throw new UnauthorizedException('User not found in database');
      }

      // リクエストにユーザー情報を添付
      request.user = user;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

**AuthModuleに追加** (`backend/src/auth/auth.module.ts`):
```typescript
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Module({
  // ...
  providers: [
    // 既存のproviders
    JwtAuthGuard,
    SupabaseAuthGuard,  // 追加
    // ...
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    SupabaseAuthGuard,  // 追加
  ],
})
export class AuthModule {}
```

**成果物**:
- ✅ `SupabaseAuthGuard`が作成済み
- ✅ `JwtAuthGuard`と並行して動作可能
- ✅ 既存のエンドポイントには影響なし

---

### タスク2.3: フロントエンド - Supabaseクライアントのセットアップ
**目的**: Supabaseクライアントを初期化（既存のAuthContextは維持）

**新規ファイル作成**: `frontend/src/lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**成果物**:
- ✅ Supabaseクライアントが初期化済み
- ✅ 既存の認証コードは影響を受けていない

---

### タスク2.4: フロントエンド - Supabase認証フックの作成
**目的**: Supabase認証用のフックを作成（既存のAuthContextと並行）

**新規ファイル作成**: `frontend/src/hooks/useSupabaseAuth.ts`
```typescript
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export function useSupabaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 初回セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // セッション変更をリッスン
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    session,
    loading,
    // 認証メソッド
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      }),
    signInWithGithub: () =>
      supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      }),
    signInWithEmail: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string, metadata?: any) =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      }),
    signOut: () => supabase.auth.signOut(),
  };
}
```

**成果物**:
- ✅ `useSupabaseAuth`フックが作成済み
- ✅ 既存の`AuthContext`は維持されている

---

### タスク2.5: テスト用エンドポイントの作成
**目的**: Supabase認証の動作確認用エンドポイント

**新規ファイル作成**: `backend/src/auth/auth.controller.ts`に追加
```typescript
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Controller('auth')
export class AuthController {
  // 既存のエンドポイント...

  // テスト用：Supabase認証エンドポイント
  @UseGuards(SupabaseAuthGuard)
  @Get('test/supabase')
  testSupabase(@Request() req: AuthenticatedRequest) {
    return {
      message: 'Supabase authentication successful',
      user: req.user,
    };
  }

  // テスト用：既存JWT認証エンドポイント
  @UseGuards(JwtAuthGuard)
  @Get('test/jwt')
  testJwt(@Request() req: AuthenticatedRequest) {
    return {
      message: 'JWT authentication successful',
      user: req.user,
    };
  }
}
```

**成果物**:
- ✅ テスト用エンドポイントが作成済み
- ✅ 両方の認証方式が並行稼働可能

---

## ✅ フェーズ3: 動作確認・テスト（4日目）

### タスク3.1: Supabase認証フローのテスト

**テスト手順**:

1. **新規ユーザー登録テスト**:
```bash
# Supabaseダッシュボードで新規ユーザーを作成
# または、フロントエンドで signUp を実行
```

2. **トリガー動作確認**:
```sql
-- Supabase SQL Editor
SELECT * FROM auth.users ORDER BY created_at DESC LIMIT 1;
SELECT * FROM public.users WHERE supabase_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
-- 両方に同じユーザーが存在することを確認
```

3. **ログインテスト**:
```typescript
// フロントエンドで実行
const { user, session } = useSupabaseAuth();
// sessionにアクセストークンが含まれることを確認
```

4. **APIコールテスト**:
```typescript
// フロントエンドで実行
const response = await fetch(`${API_BASE_URL}/auth/test/supabase`, {
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
  },
});
// 200 OKが返ることを確認
```

**確認項目**:
- ✅ Supabaseで新規ユーザー登録ができる
- ✅ auth.usersとpublic.usersに同期される
- ✅ ログインしてセッションが取得できる
- ✅ `/auth/test/supabase`にアクセスできる
- ✅ 既存の認証（`/auth/test/jwt`）も動作する

---

### タスク3.2: 招待コードシステムの統合テスト

**実装**: フロントエンドで招待コード検証を追加

```typescript
// フロントエンドの登録フロー例
async function registerWithInvitation(email, password, invitationCode) {
  // 1. 招待コード検証（既存のバックエンドAPI）
  await fetch(`${API_BASE_URL}/auth/verify-invitation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: invitationCode }),
  });

  // 2. Supabaseでユーザー登録
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { invitation_code: invitationCode },
    },
  });

  if (error) throw error;

  // 3. 招待コードを使用済みに（既存のバックエンドAPI）
  await fetch(`${API_BASE_URL}/auth/use-invitation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: invitationCode }),
  });
}
```

**確認項目**:
- ✅ 招待コードなしでは登録できない
- ✅ 有効な招待コードで登録できる
- ✅ 招待コードの使用回数が増える

---

## 🔄 フェーズ4: 段階的な切り替え（5-6日目）

### タスク4.1: 新規エンドポイントをSupabase認証に切り替え

**戦略**: 新しいエンドポイントや影響の少ないエンドポイントから順次切り替え

**例**: TagControllerを切り替え

```typescript
// backend/src/tag/tag.controller.ts
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

@Controller('tag')
@UseGuards(SupabaseAuthGuard)  // JwtAuthGuard → SupabaseAuthGuard
export class TagController {
  // ... 既存のコード
}
```

**切り替え順序**:
1. ✅ Tag関連エンドポイント
2. ✅ Theme関連エンドポイント
3. ✅ Notebook関連エンドポイント
4. ✅ Memo関連エンドポイント（最後）

**各切り替え後にテスト**:
```bash
# 動作確認
npm run test:e2e
# または手動でフロントエンドから操作
```

---

### タスク4.2: フロントエンドのログインUIを切り替え

**段階的な切り替え**:

1. **ログインページに切り替えスイッチを追加**（テスト用）:
```typescript
// LoginPage.tsx
const [useSupabase, setUseSupabase] = useState(false);

// 開発環境のみスイッチを表示
{process.env.NODE_ENV === 'development' && (
  <button onClick={() => setUseSupabase(!useSupabase)}>
    {useSupabase ? 'Use Legacy Auth' : 'Use Supabase Auth'}
  </button>
)}
```

2. **Supabaseログインボタンを追加**:
```typescript
// components/ui/GoogleLoginButton.tsx（新バージョン）
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export function GoogleLoginButtonSupabase() {
  const { signInWithGoogle } = useSupabaseAuth();

  return (
    <button onClick={() => signInWithGoogle()}>
      Sign in with Google (Supabase)
    </button>
  );
}
```

3. **動作確認後、既存のボタンと入れ替え**

**確認項目**:
- ✅ Supabase認証でログインできる
- ✅ ログイン後、全機能が使える
- ✅ ログアウトできる

---

## 🗑️ フェーズ5: 旧認証コードの削除（7日目以降）

### タスク5.1: すべてのエンドポイントがSupabase認証に切り替わったことを確認

**確認方法**:
```bash
# JwtAuthGuardの使用箇所を検索
cd backend/src
grep -r "JwtAuthGuard" --include="*.ts"

# 結果が auth.controller.ts（テスト用）のみであることを確認
```

**確認項目**:
- ✅ すべてのControllerが`SupabaseAuthGuard`を使用
- ✅ E2Eテストがパスする
- ✅ フロントエンドのすべての機能が動作する

---

### タスク5.2: 旧認証コードの削除

**削除実行**（`SUPABASE_AUTH_DELETION_CHECKLIST.md`を参照）:

```bash
# ファイル削除
cd backend/src/auth
rm google.strategy.ts github.strategy.ts x.strategy.ts
rm google-auth.guard.ts github-auth.guard.ts x-auth.guard.ts
rm jwt.strategy.ts types/oauth.types.ts
rm dto/google-register-with-invitation.dto.ts
rm dto/github-register-with-invitation.dto.ts
rm dto/x-register-with-invitation.dto.ts
rm dto/login.dto.ts dto/reset-password.dto.ts

cd ../../../frontend/src
rm utils/auth.ts utils/oauthAuth.ts
rm contexts/AuthContext.tsx

# npm依存関係削除
cd ../../backend
npm uninstall @nestjs/passport @nestjs/jwt passport passport-google-oauth20 passport-github2 passport-jwt passport-twitter bcrypt express-session
```

---

### タスク5.3: データベーススキーマのクリーンアップ

**Prismaスキーマから旧フィールドを削除**:
```prisma
model User {
  id          String   @id @default(uuid())

  // 削除
  // oauthId     String?  @unique @map("oauth_id")
  // password    String?

  // Supabase Auth用（保持）
  supabaseUserId String @unique @map("supabase_user_id")

  email       String   @unique
  name        String?
  role        UserRole @default(FREE)

  // 削除
  // emailVerified        Boolean   @default(false)
  // emailVerificationToken String?
  // resetPasswordToken     String?
  // resetPasswordExpires   DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // ... リレーション
}
```

**マイグレーション実行**:
```bash
cd backend
npx prisma migrate dev --name remove_legacy_auth_fields
npx prisma generate
```

---

### タスク5.4: 環境変数のクリーンアップ

**.envから削除**:
```bash
# 手動で以下を削除
JWT_SECRET
SESSION_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_REDIRECT_URI
X_CONSUMER_KEY
X_CONSUMER_SECRET
X_REDIRECT_URI
```

**フロントエンド .envから削除**:
```bash
VITE_GOOGLE_CLIENT_ID
VITE_GITHUB_CLIENT_ID
VITE_X_CONSUMER_KEY
```

---

### タスク5.5: 最終確認

**確認項目**:
- ✅ アプリケーションがビルドできる
- ✅ すべてのテストがパスする
- ✅ ログイン・ログアウトが動作する
- ✅ 全機能が正常に動作する
- ✅ 旧認証関連のコードが残っていない

---

## 📊 進捗管理

各フェーズの完了後、以下のチェックリストで確認：

### フェーズ1 完了チェック
- [ ] Supabaseプロジェクト作成完了
- [ ] データベーススキーマ更新完了
- [ ] 依存関係インストール完了

### フェーズ2 完了チェック
- [ ] SupabaseServiceが動作
- [ ] SupabaseAuthGuardが動作
- [ ] フロントエンドフックが動作
- [ ] テストエンドポイントがレスポンスを返す

### フェーズ3 完了チェック
- [ ] 新規ユーザー登録が動作
- [ ] ログインが動作
- [ ] 招待コードシステムが動作
- [ ] 既存認証も並行して動作

### フェーズ4 完了チェック
- [ ] すべてのエンドポイントが切り替え完了
- [ ] フロントエンドUIが切り替え完了
- [ ] E2Eテストがパス

### フェーズ5 完了チェック
- [ ] 旧認証コード削除完了
- [ ] スキーマクリーンアップ完了
- [ ] 環境変数クリーンアップ完了
- [ ] 最終テスト完了

---

## ⚠️ ロールバック手順

各フェーズで問題が発生した場合のロールバック方法：

### フェーズ2-3でロールバック
```bash
# Supabase関連のコードをコメントアウトまたは削除
# 既存の認証コードは残っているため、通常通り動作
```

### フェーズ4でロールバック
```bash
# SupabaseAuthGuard → JwtAuthGuard に戻す
# フロントエンドのログインUIを旧版に戻す
```

### フェーズ5でロールバック
```bash
# Gitで前のコミットに戻す
git revert HEAD

# または、削除したコードを再度追加
```

---

## 🎯 各フェーズの所要時間目安

- **フェーズ1**: 1日（セットアップ）
- **フェーズ2**: 2-3日（実装）
- **フェーズ3**: 1日（テスト）
- **フェーズ4**: 1-2日（段階的切り替え）
- **フェーズ5**: 1日（クリーンアップ）

**合計**: 6-8日

---

## 📝 次のアクション

まずはフェーズ1から始めましょう。準備ができたら「フェーズ1を始めます」と伝えてください。

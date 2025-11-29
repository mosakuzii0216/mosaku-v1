# Supabase Auth移行 - 削除チェックリスト

このドキュメントは、Supabase Authに移行する際に削除すべきファイルとコードを示します。

## 🗑️ 削除するファイル一覧

### バックエンド（backend/src/auth/）

#### 完全削除するファイル

```bash
# OAuth関連の戦略ファイル
backend/src/auth/google.strategy.ts
backend/src/auth/github.strategy.ts
backend/src/auth/x.strategy.ts

# OAuth関連のガードファイル
backend/src/auth/google-auth.guard.ts
backend/src/auth/github-auth.guard.ts
backend/src/auth/x-auth.guard.ts

# JWT関連（Supabaseが管理するため不要）
backend/src/auth/jwt.strategy.ts

# OAuth型定義
backend/src/auth/types/oauth.types.ts

# OAuth関連のDTO
backend/src/auth/dto/google-register-with-invitation.dto.ts
backend/src/auth/dto/github-register-with-invitation.dto.ts
backend/src/auth/dto/x-register-with-invitation.dto.ts

# 認証関連のDTO（Supabaseが管理）
backend/src/auth/dto/login.dto.ts
backend/src/auth/dto/reset-password.dto.ts
backend/src/auth/dto/create-user.dto.ts  # 一部は保持する可能性あり
```

#### 削除対象の主要ファイル（大幅な変更が必要）

```bash
backend/src/auth/auth.controller.ts     # OAuth関連エンドポイントを削除
backend/src/auth/auth.service.ts        # OAuth・JWT関連メソッドを削除
backend/src/auth/auth.module.ts         # Passport関連の依存を削除
```

#### 保持するファイル（変更が必要）

```bash
backend/src/auth/jwt-auth.guard.ts      # Supabase用に書き換え
backend/src/auth/public.decorator.ts    # そのまま使用
backend/src/auth/types.ts               # ユーザー型定義は保持
```

### フロントエンド（frontend/src/）

#### 完全削除するファイル

```bash
# 認証ユーティリティ（すべてSupabaseに置き換え）
frontend/src/utils/auth.ts
frontend/src/utils/oauthAuth.ts

# 認証コンテキスト（Supabaseフックに置き換え）
frontend/src/contexts/AuthContext.tsx
```

#### 削除または書き換えが必要なコンポーネント

```bash
frontend/src/components/ui/GoogleLoginButton.tsx    # Supabase用に書き換え
frontend/src/components/ui/GitHubLoginButton.tsx    # Supabase用に書き換え
frontend/src/components/ui/XLoginButton.tsx         # Supabase用に書き換え

# 以下のコンポーネントも認証ロジックを使用している可能性
frontend/src/pages/LoginPage.tsx              # 確認が必要
frontend/src/pages/RegisterPage.tsx           # 確認が必要
```

## 🔧 変更が必要なファイル

### バックエンド

#### 1. `backend/src/auth/auth.module.ts`

**削除する部分:**
```typescript
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { GoogleStrategy } from './google.strategy';
import { GitHubStrategy } from './github.strategy';
import { XStrategy } from './x.strategy';
import { JwtStrategy } from './jwt.strategy';
import { GoogleAuthGuard } from './google-auth.guard';
import { GitHubAuthGuard } from './github-auth.guard';
import { XAuthGuard } from './x-auth.guard';

// imports配列から削除
PassportModule,
JwtModule.registerAsync({...}),

// providers配列から削除
GoogleStrategy,
GitHubStrategy,
XStrategy,
JwtStrategy,
GoogleAuthGuard,
GitHubAuthGuard,
XAuthGuard,

// exports配列から削除
GoogleAuthGuard,
GitHubAuthGuard,
XAuthGuard,
```

**追加する部分:**
```typescript
import { SupabaseService } from '../supabase/supabase.service';

// providers配列に追加
SupabaseService,

// exports配列に追加
SupabaseService,
```

#### 2. `backend/src/auth/auth.controller.ts`

**削除するエンドポイント:**
- すべてのOAuth関連エンドポイント（`/auth/google`, `/auth/github`, `/auth/x`とそのコールバック）
- `/auth/register` - Supabaseが管理
- `/auth/login` - Supabaseが管理
- `/auth/reset-password` - Supabaseが管理
- `/auth/change-password` - Supabaseが管理

**保持するエンドポイント:**
- `/auth/verify-invitation` - 招待コード検証（登録前）
- `/auth/use-invitation` - 招待コード使用（登録後）

#### 3. `backend/src/auth/auth.service.ts`

**削除するメソッド:**
```typescript
validateGoogleUser()
validateGitHubUser()
validateXUser()
register()
validateUser()
login()
hashPassword()
comparePassword()
generateResetToken()
resetPassword()
changePassword()
```

**保持するメソッド:**
- 招待コード関連のロジック（InvitationServiceに移動する可能性も）

#### 4. `backend/src/auth/jwt-auth.guard.ts`

**完全に書き換え:**
Supabaseのトークン検証を行う`SupabaseAuthGuard`に置き換える。

#### 5. `backend/src/config/config.service.ts`

**削除する環境変数getter:**
```typescript
get jwtSecret(): string { ... }
get sessionSecret(): string { ... }
get googleClientId(): string { ... }
get googleClientSecret(): string { ... }
get googleRedirectUri(): string { ... }
get githubClientId(): string { ... }
get githubClientSecret(): string { ... }
get githubRedirectUri(): string { ... }
get xConsumerKey(): string { ... }
get xConsumerSecret(): string { ... }
get xRedirectUri(): string { ... }
```

**保持する環境変数getter:**
```typescript
get supabaseUrl(): string { ... }
get supabaseAnonKey(): string { ... }
get frontendUrl(): string { ... }
get corsOrigins(): string[] { ... }
```

#### 6. `backend/src/main.ts`

**削除する部分:**
```typescript
import * as session from 'express-session';

// Session設定を削除
app.use(
  session({
    secret: configService.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { ... },
  }),
);
```

### フロントエンド

#### 1. すべてのAPIコール箇所

**変更前:**
```typescript
import { AuthTokenManager } from '../utils/auth';

const token = AuthTokenManager.getAccessToken();
fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**変更後:**
```typescript
import { supabase } from '../lib/supabase';

const { data: { session } } = await supabase.auth.getSession();
fetch(url, {
  headers: {
    'Authorization': `Bearer ${session?.access_token}`,
  },
});
```

#### 2. 認証状態の確認箇所

**変更前:**
```typescript
import { useAuth } from '../contexts/AuthContext';

const { user, isAuthenticated } = useAuth();
```

**変更後:**
```typescript
import { useAuth } from '../hooks/useAuth';  // 新規作成

const { user, session } = useAuth();
```

## 📦 削除するnpm依存関係

### バックエンド（backend/package.json）

```bash
cd backend
npm uninstall @nestjs/passport @nestjs/jwt passport passport-google-oauth20 passport-github2 passport-jwt passport-twitter bcrypt @types/passport-google-oauth20 @types/passport-github2 @types/passport-jwt @types/passport-twitter @types/bcrypt express-session @types/express-session
```

```json
// dependencies から削除
"@nestjs/passport": "^11.0.5",
"@nestjs/jwt": "^11.0.0",
"passport": "^0.7.0",
"passport-google-oauth20": "^2.0.0",
"passport-github2": "^0.1.12",
"passport-jwt": "^4.0.1",
"passport-twitter": "^1.0.4",
"bcrypt": "^6.0.0",
"express-session": "^1.18.1",

// devDependencies から削除
"@types/passport-google-oauth20": "^2.0.16",
"@types/passport-github2": "^1.2.9",
"@types/passport-jwt": "^4.0.1",
"@types/passport-twitter": "^1.0.40",
"@types/bcrypt": "^6.0.0",
"@types/express-session": "^1.18.1",
```

**追加する依存関係:**
```bash
npm install @supabase/supabase-js
```

### フロントエンド（frontend/package.json）

**追加する依存関係:**
```bash
cd frontend
npm install @supabase/supabase-js
```

## 🔐 削除する環境変数

### バックエンド（.env）

```bash
# 削除する変数
JWT_SECRET=xxx
SESSION_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REDIRECT_URI=xxx
X_CONSUMER_KEY=xxx
X_CONSUMER_SECRET=xxx
X_REDIRECT_URI=xxx
```

**保持する変数:**
```bash
# 既に存在（そのまま使用）
SUPABASE_URL=xxx
SUPABASE_ANON_KEY=xxx
DATABASE_URL=xxx
DIRECT_URL=xxx
CORS_ORIGINS=xxx
ADMIN_EMAIL=xxx
```

### フロントエンド（.env）

```bash
# 削除する変数
VITE_GOOGLE_CLIENT_ID=xxx
VITE_GITHUB_CLIENT_ID=xxx
VITE_X_CONSUMER_KEY=xxx
```

**保持する変数:**
```bash
# 既に存在（そのまま使用）
VITE_SUPABASE_URL=xxx
VITE_SUPABASE_ANON_KEY=xxx
VITE_BACKEND_URL=xxx
VITE_APP_URL=xxx
```

## ✅ 削除手順

### ステップ1: バックエンドファイルの削除

```bash
cd backend/src/auth

# OAuth戦略ファイルを削除
rm google.strategy.ts github.strategy.ts x.strategy.ts

# OAuth ガードファイルを削除
rm google-auth.guard.ts github-auth.guard.ts x-auth.guard.ts

# JWT戦略を削除
rm jwt.strategy.ts

# OAuth型定義を削除
rm types/oauth.types.ts

# OAuth DTOを削除
rm dto/google-register-with-invitation.dto.ts
rm dto/github-register-with-invitation.dto.ts
rm dto/x-register-with-invitation.dto.ts
rm dto/login.dto.ts
rm dto/reset-password.dto.ts
```

### ステップ2: フロントエンドファイルの削除

```bash
cd frontend/src

# 認証ユーティリティを削除
rm utils/auth.ts utils/oauthAuth.ts

# 認証コンテキストを削除
rm contexts/AuthContext.tsx
```

### ステップ3: npm依存関係のクリーンアップ

```bash
# バックエンド
cd backend
npm uninstall @nestjs/passport @nestjs/jwt passport passport-google-oauth20 passport-github2 passport-jwt passport-twitter bcrypt express-session
npm install @supabase/supabase-js

# フロントエンド
cd ../frontend
npm install @supabase/supabase-js
```

### ステップ4: 環境変数ファイルの更新

```bash
# .envファイルからOAuth関連の変数を削除
# エディタで手動編集、または：

# バックエンド .env から削除
sed -i.bak '/JWT_SECRET/d; /SESSION_SECRET/d; /GOOGLE_CLIENT/d; /GITHUB_CLIENT/d; /X_CONSUMER/d' .env

# フロントエンド .env から削除
cd frontend
sed -i.bak '/VITE_GOOGLE_CLIENT_ID/d; /VITE_GITHUB_CLIENT_ID/d; /VITE_X_CONSUMER_KEY/d' .env
```

## ⚠️ 注意事項

1. **既存ユーザーのデータ移行**が必要な場合は、別途移行スクリプトを作成する必要があります
2. **招待コードシステム**は維持する場合、バックエンドに残す必要があります
3. **データベーススキーマの変更**も必要です（User.password, User.oauthId などのフィールド削除）
4. **段階的な移行**を推奨：まずSupabase認証を追加し、動作確認後に旧認証を削除

## 📝 次のステップ

削除後は以下の新規ファイルを作成する必要があります：

1. `backend/src/supabase/supabase.service.ts` - Supabaseクライアント
2. `backend/src/auth/supabase-auth.guard.ts` - Supabase認証ガード
3. `frontend/src/lib/supabase.ts` - Supabaseクライアント初期化
4. `frontend/src/hooks/useAuth.ts` - Supabase認証フック

詳細な実装例は別途提供します。

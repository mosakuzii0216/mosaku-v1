# Supabase OAuth + 招待コード実装計画

## 概要

現在の独自認証から Supabase 認証に移行する際、「招待コード入力 → OAuth 認証」のフローを実現するための実装計画。

**希望するユーザーフロー:**
1. ユーザーが招待コードを入力
2. 招待コードをバックエンドで検証
3. OAuth ボタンをクリック（Google/GitHub/X）
4. OAuth プロバイダーで認証
5. コールバック後、ユーザー作成 + 招待コード使用回数を増やす

---

## パターン A: sessionStorage 利用（推奨）

### 特徴
- **実装難易度**: 低
- **セキュリティ**: 中（バックエンドで再検証するため実用上十分）
- **インフラ要件**: なし
- **推奨度**: ⭐⭐⭐⭐⭐

### フロー図

```
┌─────────────┐
│ユーザー     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│1. 招待コード入力フォーム    │
│   (SupabaseOAuthWithInvite)  │
└──────┬──────────────────────┘
       │ 招待コード送信
       ▼
┌─────────────────────────────┐
│2. バックエンド検証           │
│   POST /invitation/verify    │
└──────┬──────────────────────┘
       │ 検証OK
       ▼
┌─────────────────────────────┐
│3. sessionStorageに保存      │
│   validated_invitation_code  │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│4. OAuth選択画面表示         │
│   Google/GitHub/X ボタン     │
└──────┬──────────────────────┘
       │ ボタンクリック
       ▼
┌─────────────────────────────┐
│5. Supabase OAuth開始        │
│   signInWithOAuth()          │
└──────┬──────────────────────┘
       │ OAuth認証
       ▼
┌─────────────────────────────┐
│6. OAuthプロバイダー認証     │
│   (Google/GitHub/X)          │
└──────┬──────────────────────┘
       │ 認証成功
       ▼
┌─────────────────────────────┐
│7. /auth/callbackにリダイレクト│
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│8. sessionStorageから        │
│   招待コードを取得           │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│9. バックエンドに送信         │
│   POST /auth/supabase-register│
│   + Supabase JWT             │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│10. ユーザー作成 + 招待コード│
│    使用回数インクリメント    │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│11. ホーム画面へリダイレクト │
└─────────────────────────────┘
```

### 実装タスク

#### フロントエンド（React）

##### タスク 1: Supabase クライアントセットアップ
- [ ] `npm install @supabase/supabase-js`
- [ ] `frontend/src/lib/supabaseClient.ts` を作成
- [ ] 環境変数 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` を設定

**ファイル:** `frontend/src/lib/supabaseClient.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

##### タスク 2: 招待コード入力 + OAuth 選択コンポーネント作成
- [ ] `frontend/src/components/auth/SupabaseOAuthWithInvite.tsx` を作成
- [ ] 招待コード入力フォームを実装
- [ ] `/invitation/verify` API 呼び出しを実装
- [ ] sessionStorage に招待コードを保存する処理を実装
- [ ] OAuth ボタン（Google/GitHub/X）を実装
- [ ] Supabase `signInWithOAuth()` を呼び出す処理を実装

**ファイル:** `frontend/src/components/auth/SupabaseOAuthWithInvite.tsx`
```typescript
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { API_BASE_URL } from '../../utils/api';

export default function SupabaseOAuthWithInvite() {
  const [invitationCode, setInvitationCode] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: 招待コード検証
  const handleValidateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/invitation/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: invitationCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '招待コードが無効です');
      }

      // 検証成功：招待コードを sessionStorage に保存
      sessionStorage.setItem('validated_invitation_code', invitationCode);
      setIsValidated(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: OAuth 認証開始
  const handleOAuthLogin = async (provider: 'google' | 'github' | 'twitter') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  };

  // 招待コード入力画面
  if (!isValidated) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">招待コード入力</h2>

        <form onSubmit={handleValidateInvitation}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              招待コード
            </label>
            <input
              type="text"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="招待コードを入力してください"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !invitationCode.trim()}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '検証中...' : '次へ'}
          </button>
        </form>
      </div>
    );
  }

  // OAuth 認証選択画面
  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">認証方法を選択</h2>

      <div className="mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700">
        ✓ 招待コードが確認されました
      </div>

      <div className="space-y-3">
        <button
          onClick={() => handleOAuthLogin('google')}
          className="w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <span>Google でログイン</span>
        </button>

        <button
          onClick={() => handleOAuthLogin('github')}
          className="w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-gray-900 flex items-center justify-center gap-2"
        >
          <span>GitHub でログイン</span>
        </button>

        <button
          onClick={() => handleOAuthLogin('twitter')}
          className="w-full bg-blue-400 text-white py-2 px-4 rounded-md hover:bg-blue-500 flex items-center justify-center gap-2"
        >
          <span>X (Twitter) でログイン</span>
        </button>
      </div>

      <div className="text-center mt-4">
        <button
          onClick={() => setIsValidated(false)}
          className="text-blue-500 hover:text-blue-600 text-sm"
        >
          招待コードを変更
        </button>
      </div>
    </div>
  );
}
```

---

##### タスク 3: OAuth コールバックページ作成
- [ ] `frontend/src/pages/AuthCallback.tsx` を作成
- [ ] Supabase セッションを取得
- [ ] sessionStorage から招待コードを取得
- [ ] `/auth/supabase-register` API を呼び出し
- [ ] sessionStorage をクリア
- [ ] ホーム画面にリダイレクト

**ファイル:** `frontend/src/pages/AuthCallback.tsx`
```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { API_BASE_URL } from '../utils/api';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase セッション取得
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          throw new Error('認証に失敗しました');
        }

        // sessionStorage から招待コードを取得
        const invitationCode = sessionStorage.getItem('validated_invitation_code');

        if (!invitationCode) {
          // 既存ユーザーのログインケース（招待コード不要）
          navigate('/');
          return;
        }

        // バックエンドでユーザー同期 + 招待コード使用
        const response = await fetch(`${API_BASE_URL}/auth/supabase-register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ invitationCode }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || '登録に失敗しました');
        }

        // 招待コードをクリア
        sessionStorage.removeItem('validated_invitation_code');

        // ホームにリダイレクト
        navigate('/');
      } catch (err: any) {
        console.error(err);
        setError(err.message);
        // エラー時は数秒後にログインページへ
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">エラーが発生しました</div>
          <div className="text-gray-600">{error}</div>
          <div className="text-sm text-gray-500 mt-4">ログインページにリダイレクトします...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <div className="text-gray-600">認証処理中...</div>
      </div>
    </div>
  );
}
```

---

##### タスク 4: ルーティング設定
- [ ] `/auth/callback` ルートを追加
- [ ] `/register` または `/signup` で `SupabaseOAuthWithInvite` を表示

**ファイル:** `frontend/src/App.tsx` (例)
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SupabaseOAuthWithInvite from './components/auth/SupabaseOAuthWithInvite';
import AuthCallback from './pages/AuthCallback';
// ... その他のインポート

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<SupabaseOAuthWithInvite />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* ... その他のルート */}
      </Routes>
    </BrowserRouter>
  );
}
```

---

#### バックエンド（NestJS）

##### タスク 5: Supabase JWT 検証 Guard 作成
- [ ] `backend/src/auth/guards/supabase-auth.guard.ts` を作成
- [ ] Supabase JWT を検証するロジックを実装
- [ ] `@supabase/supabase-js` をインストール（管理用クライアント）

**ファイル:** `backend/src/auth/guards/supabase-auth.guard.ts`
```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '../../config/config.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private supabase;

  constructor(private configService: ConfigService) {
    // Supabase Admin クライアント（サーバーサイド用）
    this.supabase = createClient(
      this.configService.get('SUPABASE_URL'),
      this.configService.get('SUPABASE_SERVICE_ROLE_KEY'), // service_role キー（管理用）
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const token = authHeader.substring(7);

    try {
      // Supabase JWT を検証
      const { data: { user }, error } = await this.supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Invalid token');
      }

      // リクエストにユーザー情報を追加
      request.user = user;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

---

##### タスク 6: `/auth/supabase-register` エンドポイント作成
- [ ] `SupabaseRegisterDto` を作成
- [ ] `auth.controller.ts` に POST エンドポイント追加
- [ ] Supabase ユーザー情報を Prisma の `users` テーブルに同期
- [ ] 招待コードの使用回数をインクリメント

**ファイル:** `backend/src/auth/dto/supabase-register.dto.ts`
```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class SupabaseRegisterDto {
  @IsString()
  @IsNotEmpty()
  invitationCode: string;
}
```

**ファイル:** `backend/src/auth/auth.controller.ts`
```typescript
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { SupabaseRegisterDto } from './dto/supabase-register.dto';

// ... 既存のコード

@Public()
@Post('supabase-register')
@UseGuards(SupabaseAuthGuard)
async supabaseRegister(
  @Request() req,
  @Body() body: SupabaseRegisterDto,
) {
  const supabaseUser = req.user; // SupabaseAuthGuard がデコードしたユーザー情報

  try {
    // 招待コードを再検証（念のため）
    await this.invitationService.verifyInvitation(body.invitationCode);

    // Prisma の users テーブルにユーザーを作成（既存なら何もしない）
    const user = await this.prisma.user.upsert({
      where: { id: supabaseUser.id },
      update: {}, // 既存ユーザーの場合は更新不要
      create: {
        id: supabaseUser.id, // Supabase の UID を使用
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.name || supabaseUser.email,
        role: this.configService.isAdminEmail(supabaseUser.email) ? 'ADMIN' : 'FREE',
      },
    });

    // 招待コードの使用回数を増やす
    await this.invitationService.useInvitation(body.invitationCode);

    return {
      message: 'Registration successful',
      user,
    };
  } catch (error) {
    throw new BadRequestException(error.message || 'Registration failed');
  }
}
```

---

##### タスク 7: 環境変数設定
- [ ] `backend/.env` に以下を追加:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (バックエンド用・管理権限)

**ファイル:** `backend/.env`
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

##### タスク 8: `/invitation/verify` エンドポイントの確認
- [ ] 既存の `InvitationController` に `POST /invitation/verify` エンドポイントがあるか確認
- [ ] なければ追加

**ファイル:** `backend/src/invitation/invitation.controller.ts`
```typescript
import { VerifyInvitationDto } from './dto/verify-invitation.dto';

// ... 既存のコード

@Public()
@Post('verify')
async verifyInvitation(@Body() dto: VerifyInvitationDto) {
  try {
    const invitation = await this.invitationService.verifyInvitation(dto.code);
    return {
      message: 'Invitation code is valid',
      invitation: {
        maxUses: invitation.maxUses,
        usedCount: invitation.usedCount,
        expiresAt: invitation.expiresAt,
      },
    };
  } catch (error) {
    throw new BadRequestException(error.message);
  }
}
```

---

#### テスト

##### タスク 9: E2E テスト
- [ ] 招待コード入力 → OAuth 認証 → ユーザー作成の一連のフローをテスト
- [ ] 無効な招待コードでエラーが表示されることを確認
- [ ] 期限切れの招待コードでエラーが表示されることを確認
- [ ] 既存ユーザーがログインできることを確認（招待コード不要）

---

### パターン A のメリット・デメリット

**メリット:**
- 実装がシンプル
- 追加のインフラ不要（Redis 等）
- バックエンドで再検証するため、sessionStorage が改ざんされても安全
- デバッグしやすい

**デメリット:**
- sessionStorage はブラウザの開発者ツールで改ざん可能（ただし再検証するため影響は限定的）
- ブラウザを閉じると sessionStorage がクリアされる（タブを閉じても残る）

---

## パターン B: 一時トークン利用（よりセキュア）

### 特徴
- **実装難易度**: 中
- **セキュリティ**: 高
- **インフラ要件**: Redis 推奨（メモリキャッシュでも可）
- **推奨度**: ⭐⭐⭐⭐

### フロー図

```
┌─────────────┐
│ユーザー     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│1. 招待コード入力フォーム    │
└──────┬──────────────────────┘
       │ 招待コード送信
       ▼
┌─────────────────────────────┐
│2. バックエンド検証 + トークン│
│   POST /invitation/create-temp-token│
│   → 一時トークン発行（5分有効）│
└──────┬──────────────────────┘
       │ 一時トークン返却
       ▼
┌─────────────────────────────┐
│3. OAuth選択画面表示         │
│   (一時トークンを保持)       │
└──────┬──────────────────────┘
       │ ボタンクリック
       ▼
┌─────────────────────────────┐
│4. Supabase OAuth開始        │
│   redirectTo に一時トークン含む│
└──────┬──────────────────────┘
       │ OAuth認証
       ▼
┌─────────────────────────────┐
│5. OAuthプロバイダー認証     │
└──────┬──────────────────────┘
       │ 認証成功
       ▼
┌─────────────────────────────┐
│6. /auth/callback?token=xxx  │
│   にリダイレクト             │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│7. クエリパラメータから      │
│   一時トークンを取得         │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│8. バックエンドに送信         │
│   POST /auth/supabase-register│
│   + Supabase JWT + token     │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│9. トークンから招待コード取得│
│   (トークンは1回限り削除)    │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│10. ユーザー作成 + 招待コード│
│    使用回数インクリメント    │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│11. ホーム画面へリダイレクト │
└─────────────────────────────┘
```

### 実装タスク

#### フロントエンド（React）

##### タスク 1: Supabase クライアントセットアップ
- パターン A と同じ

---

##### タスク 2: 招待コード入力 + OAuth 選択コンポーネント作成（一時トークン版）
- [ ] `frontend/src/components/auth/SupabaseOAuthWithInviteV2.tsx` を作成
- [ ] `/invitation/create-temp-token` API 呼び出しを実装
- [ ] 一時トークンを state に保存
- [ ] OAuth の `redirectTo` に一時トークンをクエリパラメータとして含める

**ファイル:** `frontend/src/components/auth/SupabaseOAuthWithInviteV2.tsx`
```typescript
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { API_BASE_URL } from '../../utils/api';

export default function SupabaseOAuthWithInviteV2() {
  const [invitationCode, setInvitationCode] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: 招待コード検証 + 一時トークン取得
  const handleValidateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/invitation/create-temp-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: invitationCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '招待コードが無効です');
      }

      const { token } = await response.json();
      setTempToken(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: OAuth 認証開始（一時トークンを含める）
  const handleOAuthLogin = async (provider: 'google' | 'github' | 'twitter') => {
    if (!tempToken) {
      setError('一時トークンが見つかりません');
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // redirectTo に一時トークンを含める
        redirectTo: `${window.location.origin}/auth/callback?token=${tempToken}`,
      },
    });

    if (error) {
      setError(error.message);
    }
  };

  // 招待コード入力画面
  if (!tempToken) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">招待コード入力</h2>

        <form onSubmit={handleValidateInvitation}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              招待コード
            </label>
            <input
              type="text"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="招待コードを入力してください"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !invitationCode.trim()}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '検証中...' : '次へ'}
          </button>
        </form>
      </div>
    );
  }

  // OAuth 認証選択画面
  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">認証方法を選択</h2>

      <div className="mb-4 p-3 rounded-lg text-sm bg-green-100 text-green-700">
        ✓ 招待コードが確認されました（5分間有効）
      </div>

      <div className="space-y-3">
        <button
          onClick={() => handleOAuthLogin('google')}
          className="w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50"
        >
          Google でログイン
        </button>

        <button
          onClick={() => handleOAuthLogin('github')}
          className="w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-gray-900"
        >
          GitHub でログイン
        </button>

        <button
          onClick={() => handleOAuthLogin('twitter')}
          className="w-full bg-blue-400 text-white py-2 px-4 rounded-md hover:bg-blue-500"
        >
          X (Twitter) でログイン
        </button>
      </div>

      <div className="text-center mt-4">
        <button
          onClick={() => setTempToken(null)}
          className="text-blue-500 hover:text-blue-600 text-sm"
        >
          招待コードを変更
        </button>
      </div>
    </div>
  );
}
```

---

##### タスク 3: OAuth コールバックページ作成（一時トークン版）
- [ ] `frontend/src/pages/AuthCallbackV2.tsx` を作成
- [ ] URL クエリパラメータから一時トークンを取得
- [ ] `/auth/supabase-register` に一時トークンを送信

**ファイル:** `frontend/src/pages/AuthCallbackV2.tsx`
```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { API_BASE_URL } from '../utils/api';

export default function AuthCallbackV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase セッション取得
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          throw new Error('認証に失敗しました');
        }

        // クエリパラメータから一時トークンを取得
        const tempToken = searchParams.get('token');

        if (!tempToken) {
          // 既存ユーザーのログインケース（トークン不要）
          navigate('/');
          return;
        }

        // バックエンドでユーザー同期 + 招待コード使用
        const response = await fetch(`${API_BASE_URL}/auth/supabase-register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ tempToken }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || '登録に失敗しました');
        }

        // ホームにリダイレクト
        navigate('/');
      } catch (err: any) {
        console.error(err);
        setError(err.message);
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">エラーが発生しました</div>
          <div className="text-gray-600">{error}</div>
          <div className="text-sm text-gray-500 mt-4">ログインページにリダイレクトします...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <div className="text-gray-600">認証処理中...</div>
      </div>
    </div>
  );
}
```

---

#### バックエンド（NestJS）

##### タスク 4: Redis セットアップ（推奨）
- [ ] `npm install ioredis @nestjs/cache-manager cache-manager-ioredis-yet`
- [ ] `backend/src/cache/cache.module.ts` を作成
- [ ] Redis 接続設定

**ファイル:** `backend/src/cache/cache.module.ts`
```typescript
import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import { ConfigService } from '../config/config.service';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          host: configService.get('REDIS_HOST') || 'localhost',
          port: parseInt(configService.get('REDIS_PORT') || '6379'),
          password: configService.get('REDIS_PASSWORD'),
        }),
        ttl: 300, // デフォルト5分
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
```

**代替案（Redis なし）:** メモリキャッシュを使う場合は `Map` を使用（タスク6参照）

---

##### タスク 5: `/invitation/create-temp-token` エンドポイント作成
- [ ] `InvitationService` に一時トークン発行メソッド追加
- [ ] `InvitationController` にエンドポイント追加

**ファイル:** `backend/src/invitation/invitation.service.ts`
```typescript
import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { randomBytes } from 'crypto';

@Injectable()
export class InvitationService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache, // Redis キャッシュ
  ) {}

  // ... 既存のメソッド

  /**
   * 一時トークン発行（5分間有効）
   */
  async createTempToken(invitationCode: string): Promise<string> {
    // 招待コードを検証
    await this.verifyInvitation(invitationCode);

    // 一時トークン生成
    const token = randomBytes(32).toString('hex');

    // Redis に保存（5分間有効）
    await this.cacheManager.set(
      `temp_token:${token}`,
      invitationCode,
      300000, // 5分 = 300秒 = 300000ミリ秒
    );

    return token;
  }

  /**
   * 一時トークンから招待コードを取得（1回限り）
   */
  async validateTempToken(token: string): Promise<string> {
    const invitationCode = await this.cacheManager.get<string>(`temp_token:${token}`);

    if (!invitationCode) {
      throw new BadRequestException('Invalid or expired token');
    }

    // トークンは1回限りなので削除
    await this.cacheManager.del(`temp_token:${token}`);

    return invitationCode;
  }
}
```

**Redis なしの代替実装（メモリキャッシュ）:**
```typescript
@Injectable()
export class InvitationService {
  // メモリキャッシュ（本番環境ではRedis推奨）
  private tempTokens = new Map<string, { code: string; expiresAt: Date }>();

  async createTempToken(invitationCode: string): Promise<string> {
    await this.verifyInvitation(invitationCode);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分後

    this.tempTokens.set(token, { code: invitationCode, expiresAt });

    // 期限切れトークンを定期的にクリーンアップ
    setTimeout(() => this.tempTokens.delete(token), 5 * 60 * 1000);

    return token;
  }

  async validateTempToken(token: string): Promise<string> {
    const data = this.tempTokens.get(token);

    if (!data) {
      throw new BadRequestException('Invalid token');
    }

    if (data.expiresAt < new Date()) {
      this.tempTokens.delete(token);
      throw new BadRequestException('Token expired');
    }

    // 1回限りなので削除
    this.tempTokens.delete(token);

    return data.code;
  }
}
```

**ファイル:** `backend/src/invitation/invitation.controller.ts`
```typescript
@Public()
@Post('create-temp-token')
async createTempToken(@Body() dto: VerifyInvitationDto) {
  try {
    const token = await this.invitationService.createTempToken(dto.code);
    return {
      message: 'Temporary token created',
      token,
      expiresIn: 300, // 秒
    };
  } catch (error) {
    throw new BadRequestException(error.message);
  }
}
```

---

##### タスク 6: `/auth/supabase-register` エンドポイント修正（一時トークン対応）
- [ ] `SupabaseRegisterDto` に `tempToken` フィールドを追加
- [ ] 一時トークンから招待コードを取得するロジックを追加

**ファイル:** `backend/src/auth/dto/supabase-register.dto.ts`
```typescript
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SupabaseRegisterDto {
  @IsString()
  @IsOptional()
  invitationCode?: string; // パターンA用（後方互換性）

  @IsString()
  @IsOptional()
  tempToken?: string; // パターンB用
}
```

**ファイル:** `backend/src/auth/auth.controller.ts`
```typescript
@Public()
@Post('supabase-register')
@UseGuards(SupabaseAuthGuard)
async supabaseRegister(
  @Request() req,
  @Body() body: SupabaseRegisterDto,
) {
  const supabaseUser = req.user;

  try {
    let invitationCode: string;

    // パターンB: 一時トークンから招待コードを取得
    if (body.tempToken) {
      invitationCode = await this.invitationService.validateTempToken(body.tempToken);
    }
    // パターンA: 直接招待コードを受け取る（後方互換性）
    else if (body.invitationCode) {
      invitationCode = body.invitationCode;
      // 再検証
      await this.invitationService.verifyInvitation(invitationCode);
    }
    else {
      throw new BadRequestException('Invitation code or temp token required');
    }

    // ユーザー作成
    const user = await this.prisma.user.upsert({
      where: { id: supabaseUser.id },
      update: {},
      create: {
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.name || supabaseUser.email,
        role: this.configService.isAdminEmail(supabaseUser.email) ? 'ADMIN' : 'FREE',
      },
    });

    // 招待コードの使用回数を増やす
    await this.invitationService.useInvitation(invitationCode);

    return {
      message: 'Registration successful',
      user,
    };
  } catch (error) {
    throw new BadRequestException(error.message || 'Registration failed');
  }
}
```

---

##### タスク 7: 環境変数設定（Redis 使用時）
- [ ] `backend/.env` に Redis 設定を追加

**ファイル:** `backend/.env`
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis（パターンB使用時）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

---

#### テスト

##### タスク 8: E2E テスト
- [ ] 招待コード入力 → 一時トークン取得 → OAuth 認証 → ユーザー作成のフローをテスト
- [ ] 一時トークンが5分後に無効になることを確認
- [ ] 一時トークンが1回限りであることを確認（2回目の使用でエラー）
- [ ] 無効な一時トークンでエラーが表示されることを確認

---

### パターン B のメリット・デメリット

**メリット:**
- **セキュリティが高い**: 一時トークンは1回限り、5分有効
- **改ざん不可**: サーバーサイドで管理されるため、クライアント側で改ざんできない
- **トレーサビリティ**: Redis にログを残せる

**デメリット:**
- **実装が複雑**: Redis のセットアップが必要（またはメモリキャッシュ）
- **インフラコスト**: Redis サーバーが必要
- **デバッグが難しい**: トークンが1回限りなので、再テストが面倒

---

## パターン比較表

| 項目 | パターンA (sessionStorage) | パターンB (一時トークン) |
|------|---------------------------|------------------------|
| **実装難易度** | ⭐⭐ 簡単 | ⭐⭐⭐⭐ やや複雑 |
| **セキュリティ** | ⭐⭐⭐ 中（再検証あり） | ⭐⭐⭐⭐⭐ 高 |
| **インフラ要件** | なし | Redis 推奨 |
| **開発スピード** | 速い | やや遅い |
| **保守性** | 高い | 中 |
| **トークン有効期限** | ブラウザセッション中 | 5分間 |
| **改ざんリスク** | 低（再検証あり） | なし |
| **1回限り保証** | なし | あり |
| **推奨度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 推奨アプローチ

### 初期実装: **パターン A（sessionStorage）**

理由:
- 実装コストが低い
- 既存の `InvitationService` をほぼそのまま使える
- バックエンドで再検証するため、実用上十分なセキュリティ
- 追加インフラ不要

### 将来的な強化: **パターン B（一時トークン）**

以下の条件に該当する場合、パターン B への移行を検討:
- セキュリティ要件が厳しい（金融系、医療系など）
- 既に Redis を使用している
- 招待コードの不正利用が懸念される

---

## 移行後の削除対象

Supabase 移行完了後、以下のファイル・機能を削除可能:

### フロントエンド
- [ ] `frontend/src/components/auth/OAuthWithInviteForm.tsx`（現在の実装）
- [ ] `frontend/src/components/auth/OAuthInviteForm.tsx`
- [ ] `frontend/src/contexts/AuthContext.tsx` の一部（独自JWT管理部分）
- [ ] `frontend/src/utils/auth.ts` の `AuthTokenManager`

### バックエンド
- [ ] `backend/src/auth/strategies/jwt.strategy.ts`（独自JWT検証）
- [ ] `backend/src/auth/guards/jwt-auth.guard.ts`
- [ ] `backend/src/auth/google-auth.guard.ts`
- [ ] `backend/src/auth/github-auth.guard.ts`
- [ ] `backend/src/auth/x-auth.guard.ts`
- [ ] `/auth/google/callback`（旧OAuthコールバック）
- [ ] `/auth/github/callback`
- [ ] `/auth/x/callback`
- [ ] `/auth/google/register-with-invitation`
- [ ] `/auth/github/register-with-invitation`
- [ ] `User` モデルの `password` フィールド（Supabaseで管理）
- [ ] `User` モデルの `emailVerified`, `emailVerificationToken`, `resetPasswordToken` フィールド

---

## 実装順序（推奨）

### フェーズ1: Supabase セットアップ（1-2日）
1. Supabase プロジェクト作成
2. OAuth プロバイダー設定（Google/GitHub/X）
3. 環境変数設定（フロントエンド・バックエンド）

### フェーズ2: バックエンド実装（2-3日）
1. Supabase Auth Guard 作成
2. `/auth/supabase-register` エンドポイント作成
3. `/invitation/verify` または `/invitation/create-temp-token` エンドポイント確認・作成
4. ユニットテスト作成

### フェーズ3: フロントエンド実装（2-3日）
1. Supabase クライアントセットアップ
2. `SupabaseOAuthWithInvite` コンポーネント作成
3. `AuthCallback` ページ作成
4. ルーティング設定
5. UIテスト

### フェーズ4: E2Eテスト・デバッグ（1-2日）
1. 新規登録フローのテスト
2. 既存ユーザーログインのテスト
3. エラーケースのテスト
4. バグ修正

### フェーズ5: 旧認証システム削除（1日）
1. 旧コンポーネント・エンドポイント削除
2. データベーススキーマクリーンアップ（マイグレーション）
3. 最終動作確認

**合計見積もり: 7-11日**

---

## 注意事項

1. **既存ユーザーの移行**
   - 既存ユーザーが Supabase にログインできるよう、メール認証フローを用意
   - または、管理画面で既存ユーザーを Supabase に一括インポート

2. **招待コードのバリデーション**
   - フロントエンドとバックエンドの両方で検証を行う（二重チェック）
   - バックエンドの検証が最終的な判断基準

3. **エラーハンドリング**
   - OAuth 認証失敗時の適切なエラーメッセージ
   - 招待コード無効時のユーザーフレンドリーなメッセージ
   - ネットワークエラー時のリトライ機能

4. **Supabase Row Level Security (RLS)**
   - Supabase のデータベースで RLS を設定し、ユーザーが他人のデータにアクセスできないようにする
   - Prisma と Supabase Postgres を併用する場合は、RLS の設定に注意

5. **セッション管理**
   - Supabase のセッションは自動的にリフレッシュされる
   - `supabase.auth.onAuthStateChange()` でセッション変更を監視

---

## まとめ

- **パターン A（sessionStorage）** を初期実装として推奨
- セキュリティ要件が高い場合は **パターン B（一時トークン）** を検討
- 既存の `InvitationService` はそのまま活用可能
- Supabase の機能（メール確認、パスワードリセット、2FA）を活かせる
- 実装期間は約1-2週間

質問や詳細な実装サポートが必要な場合はお気軽にどうぞ！

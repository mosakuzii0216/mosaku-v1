import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import OAuthWithInviteForm from './OAuthWithInviteForm'

export default function AuthForm() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [message, setMessage] = useState('')
  const [showResendConfirmation, setShowResendConfirmation] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup' | 'resetPassword' | 'oauth-google' | 'oauth-github'>('login')

  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'invite_required') {
      setMessage('新規ユーザーの場合は招待コードが必要です。新規登録を選択してください。')
      setMode('signup')
    }
  }, [searchParams])


  const handleGoogleLogin = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const redirectUrl = window.location.port 
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });

      if (error) throw error;
    } catch (error: unknown) {
      console.error('Google認証エラー:', error);
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  const handleGitHubLogin = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const redirectUrl = window.location.port 
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl
        }
      });

      if (error) throw error;
    } catch (error: unknown) {
      console.error('GitHub認証エラー:', error);
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  const handleOAuthWithInvite = (provider: 'google' | 'github') => {
    if (provider === 'google') {
      setMode('oauth-google')
    } else {
      setMode('oauth-github')
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    
    try {
      if (mode === 'signup') {
        const response = await fetch('http://localhost/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            name: name || undefined,
            invitationCode
          })
        })
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Registration failed')
        }
        
        const data = await response.json()
        setMessage(data.message || 'Registration successful! Please check your email for verification.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        
        if (error) throw error
      }
    } catch (error: unknown) {
      console.error('認証エラー:', error)
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      setMessage(errorMessage)
      
      // メール認証が必要な場合は再送信オプションを表示
      if (errorMessage.includes('Email not confirmed')) {
        setShowResendConfirmation(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch('http://localhost/api/auth/resend-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to resend confirmation email')
      }
      
      const data = await response.json()
      setMessage(data.message)
      setShowResendConfirmation(false)
    } catch (error: unknown) {
      console.error('確認メール再送信エラー:', error)
      setMessage(error instanceof Error ? error.message : 'Failed to resend confirmation email')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setMessage('メールアドレスを入力してください')
      return
    }
    
    setLoading(true)
    setMessage('')
    
    try {
      const response = await fetch('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to send password reset email')
      }
      
      const data = await response.json()
      setMessage(data.message)
    } catch (error: unknown) {
      console.error('パスワードリセットエラー:', error)
      setMessage(error instanceof Error ? error.message : 'Failed to send password reset email')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'oauth-google') {
    return <OAuthWithInviteForm provider="google" onBack={() => setMode('login')} />
  }

  if (mode === 'oauth-github') {
    return <OAuthWithInviteForm provider="github" onBack={() => setMode('login')} />
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {mode === 'signup' ? '新規登録' : mode === 'resetPassword' ? 'パスワードリセット' : 'ログイン'}
      </h2>
      
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.includes('successful') || message.includes('check your email') || message.includes('sent successfully')
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {message}
          {showResendConfirmation && (
            <div className="mt-2">
              <button
                onClick={handleResendConfirmation}
                disabled={loading}
                className="text-blue-600 hover:text-blue-800 underline text-sm"
              >
                確認メールを再送信
              </button>
            </div>
          )}
        </div>
      )}
      
      {mode === 'resetPassword' ? (
        <form onSubmit={(e) => {
          e.preventDefault()
          handleForgotPassword()
        }} className="space-y-4 mb-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="登録時のメールアドレスを入力"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? '送信中...' : 'パスワードリセットメールを送信'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  名前（任意）
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label htmlFor="invitationCode" className="block text-sm font-medium text-gray-700 mb-1">
                  招待コード（必須）
                </label>
                <input
                  type="text"
                  id="invitationCode"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="招待コードを入力してください"
                />
              </div>
            </>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? '処理中...' : (mode === 'signup' ? '新規登録' : 'ログイン')}
          </button>
          
          {mode === 'login' && (
            <div className="text-center mt-3">
              <button
                type="button"
                onClick={() => setMode('resetPassword')}
                className="text-blue-500 hover:text-blue-600 text-sm underline"
              >
                パスワードを忘れた方はこちら
              </button>
            </div>
          )}
        </form>
      )}
      
      <div className="text-center mb-4">
        {mode === 'resetPassword' ? (
          <button
            onClick={() => {
              setMode('login')
              setMessage('')
              setEmail('')
              setPassword('')
              setName('')
              setInvitationCode('')
              setShowResendConfirmation(false)
            }}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            ログインページに戻る
          </button>
        ) : (
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMessage('')
              setEmail('')
              setPassword('')
              setName('')
              setInvitationCode('')
              setShowResendConfirmation(false)
            }}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            {mode === 'signup' ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら'}
          </button>
        )}
      </div>
      
      {mode !== 'resetPassword' && (
        <>
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">または</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={mode === 'signup' ? () => handleOAuthWithInvite('google') : handleGoogleLogin}
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : (mode === 'signup' ? 'Googleで新規登録' : 'Googleでログイン')}
            </button>
            
            <button
              onClick={mode === 'signup' ? () => handleOAuthWithInvite('github') : handleGitHubLogin}
              disabled={loading}
              className="w-full bg-gray-800 hover:bg-gray-900 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'ログイン中...' : (mode === 'signup' ? 'GitHubで新規登録' : 'GitHubでログイン')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
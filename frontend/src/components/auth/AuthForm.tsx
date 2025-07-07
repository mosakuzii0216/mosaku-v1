import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AuthForm() {
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [showResendConfirmation, setShowResendConfirmation] = useState(false)


  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const redirectUrl = window.location.port 
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/auth/callback`
        : `${window.location.origin}/auth/callback`
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      })
      
      if (error) throw error
    } catch (error) {
      console.error('ログインエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGitHubLogin = async () => {
    setLoading(true)
    try {
      const redirectUrl = window.location.port 
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/auth/callback`
        : `${window.location.origin}/auth/callback`
        
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('ログインエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    
    try {
      if (isSignUp) {
        const response = await fetch('http://localhost/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            name: name || undefined
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
    } catch (error: any) {
      console.error('認証エラー:', error)
      const errorMessage = error.message || 'An error occurred'
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
    } catch (error: any) {
      console.error('確認メール再送信エラー:', error)
      setMessage(error.message || 'Failed to resend confirmation email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">{isSignUp ? '新規登録' : 'ログイン'}</h2>
      
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
        
        {isSignUp && (
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
        )}
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '処理中...' : (isSignUp ? '新規登録' : 'ログイン')}
        </button>
      </form>
      
      <div className="text-center mb-4">
        <button
          onClick={() => {
            setIsSignUp(!isSignUp)
            setMessage('')
            setEmail('')
            setPassword('')
            setName('')
            setShowResendConfirmation(false)
          }}
          className="text-blue-500 hover:text-blue-600 text-sm"
        >
          {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら'}
        </button>
      </div>
      
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
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'ログイン中...' : 'Googleでログイン'}
        </button>
        
        <button
          onClick={handleGitHubLogin}
          disabled={loading}
          className="w-full bg-gray-800 hover:bg-gray-900 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'ログイン中...' : 'GitHubでログイン'}
        </button>
      </div>
    </div>
  )
}
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AuthForm() {
  const [loading, setLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const redirectUrl = `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback`
            
      const { data, error } = await supabase.auth.signInWithOAuth({
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${import.meta.env.VITE_APP_URL || window.location.origin}/auth/callback`
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('ログインエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">ログイン</h2>
      
      <div className="space-y-4">
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
      
      <p className="text-sm text-gray-600 text-center mt-4">
        上記のサービスでログインしてください
      </p>
    </div>
  )
}
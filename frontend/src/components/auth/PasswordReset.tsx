import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function PasswordReset() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthRedirect = async () => {
      try {
        // URLハッシュからトークンを取得（Supabaseのパスワードリセットリンク形式）
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')
        
        if (type === 'recovery' && accessToken && refreshToken) {
          // パスワードリセット用のセッションを設定
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (error) {
            throw error
          }
          
          setMessage('新しいパスワードを入力してください。')
        } else {
          // 通常のURLパラメータもチェック
          const accessTokenParam = searchParams.get('access_token')
          const refreshTokenParam = searchParams.get('refresh_token')
          const typeParam = searchParams.get('type')
          
          if (typeParam === 'recovery' && accessTokenParam && refreshTokenParam) {
            const { error } = await supabase.auth.setSession({
              access_token: accessTokenParam,
              refresh_token: refreshTokenParam
            })
            
            if (error) {
              throw error
            }
            
            setMessage('新しいパスワードを入力してください。')
          } else {
            setMessage('無効なリセットリンクです。')
          }
        }
      } catch (error) {
        console.error('認証エラー:', error)
        setMessage('リセットリンクの処理中にエラーが発生しました。')
      }
    }
    
    handleAuthRedirect()
  }, [searchParams])

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setMessage('パスワードが一致しません')
      return
    }

    if (password.length < 6) {
      setMessage('パスワードは6文字以上で入力してください')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      // 現在のセッション状態を確認
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('認証セッションが見つかりません。リセットリンクを再度使用してください。')
      }

      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        throw error
      }

      setMessage('パスワードが正常に更新されました。ログインページに移動します。')
      
      // セッションをクリアしてログアウト
      await supabase.auth.signOut()
      
      // 3秒後にログインページにリダイレクト
      setTimeout(() => {
        navigate('/')
      }, 3000)
    } catch (error: unknown) {
      console.error('パスワードリセットエラー:', error)
      setMessage(error instanceof Error ? error.message : 'パスワードの更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">パスワードリセット</h2>
      
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.includes('正常に更新') 
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}
      
      <form onSubmit={handlePasswordReset} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            新しいパスワード
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
        
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            パスワード確認
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '更新中...' : 'パスワードを更新'}
        </button>
      </form>
      
      <div className="text-center mt-4">
        <button
          onClick={() => navigate('/')}
          className="text-blue-500 hover:text-blue-600 text-sm"
        >
          ログインページに戻る
        </button>
      </div>
    </div>
  )
}
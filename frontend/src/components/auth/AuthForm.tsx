import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { GoogleLoginButton } from '../ui/GoogleLoginButton'
import { GitHubLoginButton } from '../ui/GitHubLoginButton'
import { XLoginButton } from '../ui/XLoginButton'
import { OAuthInviteForm } from './OAuthInviteForm'

export default function AuthForm() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'resetPassword' | 'googleInvite' | 'githubInvite' | 'xInvite'>('login')
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any>(null)
  const [pendingGitHubUser, setPendingGitHubUser] = useState<any>(null)
  const [pendingXUser, setPendingXUser] = useState<any>(null)

  const { login, register, resetPassword, googleRegisterWithInvitation, githubRegisterWithInvitation, xRegisterWithInvitation } = useAuth()

  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'invitation_required') {
      // sessionStorageからpendingGoogleUserを取得
      const storedGoogleUser = sessionStorage.getItem('pendingGoogleUser')
      if (storedGoogleUser) {
        try {
          const googleUser = JSON.parse(storedGoogleUser)
          setPendingGoogleUser(googleUser)
          setMessage(`ユーザー登録には招待コードが必要です。`)
          setMode('googleInvite')
        } catch (error) {
          console.error('Failed to parse pending Google user:', error)
          setMessage('認証処理でエラーが発生しました。再度お試しください。')
        }
      }
      
      // sessionStorageからpendingGitHubUserを取得
      const storedGitHubUser = sessionStorage.getItem('pendingGitHubUser')
      if (storedGitHubUser) {
        try {
          const githubUser = JSON.parse(storedGitHubUser)
          setPendingGitHubUser(githubUser)
          setMessage(`ユーザー登録には招待コードが必要です。`)
          setMode('githubInvite')
        } catch (error) {
          console.error('Failed to parse pending GitHub user:', error)
          setMessage('認証処理でエラーが発生しました。再度お試しください。')
        }
      }
      
      // sessionStorageからpendingXUserを取得
      const storedXUser = sessionStorage.getItem('pendingXUser')
      if (storedXUser) {
        try {
          const xUser = JSON.parse(storedXUser)
          setPendingXUser(xUser)
          setMessage(`ユーザー登録には招待コードが必要です。`)
          setMode('xInvite')
        } catch (error) {
          console.error('Failed to parse pending X user:', error)
          setMessage('認証処理でエラーが発生しました。再度お試しください。')
        }
      }
      
      if (!storedGoogleUser && !storedGitHubUser && !storedXUser) {
        setMessage('新規ユーザーの場合は招待コードが必要です。新規登録を選択してください。')
        setMode('signup')
      }
    }
    
    if (error === 'invite_required') {
      setMessage('新規ユーザーの場合は招待コードが必要です。新規登録を選択してください。')
      setMode('signup')
    }
  }, [searchParams])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
        
    try {
      if (mode === 'signup') {
        await register(email, password, name || undefined, invitationCode)
        setMessage('Registration successful! You can now login with your credentials.')
        setMode('login')
        // Clear form fields
        setEmail('')
        setPassword('')
        setName('')
        setInvitationCode('')
      } else if (mode === 'login') {
        await login(email, password)
        // Login successful, useAuth will handle state update
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      setMessage(errorMessage)
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
      await resetPassword(email)
      setMessage('パスワードリセットメールを送信しました。メールをご確認ください。')
    } catch (error: unknown) {
      console.error('パスワードリセットエラー:', error)
      setMessage(error instanceof Error ? error.message : 'Failed to send password reset email')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthRegistration = async (e: React.FormEvent) => {
    e.preventDefault();

    let userToRegister;
    let registerFunction;

    if (mode === 'googleInvite') {
      userToRegister = pendingGoogleUser;
      registerFunction = googleRegisterWithInvitation;
    } else if (mode === 'githubInvite') {
      userToRegister = pendingGitHubUser;
      registerFunction = githubRegisterWithInvitation;
    } else if (mode === 'xInvite') {
      userToRegister = pendingXUser;
      registerFunction = xRegisterWithInvitation;
    } else {
      return; // Should not happen
    }

    if (!userToRegister || !invitationCode) {
      setMessage('招待コードを入力してください');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await registerFunction(userToRegister, invitationCode);
      // Success is handled by AuthContext
    } catch (error: unknown) {
      console.error(`${mode}登録エラー:`, error);
      const errorMessage = error instanceof Error ? error.message : `${mode} registration failed`;
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {mode === 'signup' ? '新規登録' : 
         mode === 'resetPassword' ? 'パスワードリセット' : 
         mode === 'googleInvite' ? 'Google アカウント登録' : 
         mode === 'githubInvite' ? 'GitHub アカウント登録' :
         mode === 'xInvite' ? 'X アカウント登録' : 
         'ログイン'}
      </h2>
      
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.includes('successful') || message.includes('送信しました')
            ? 'bg-green-100 text-green-700' 
            : 'bg-red-100 text-red-700'
        }`}>
          {message}
        </div>
      )}
      
      {mode === 'googleInvite' ? (
        <OAuthInviteForm
          providerName="Google"
          pendingUser={pendingGoogleUser}
          invitationCode={invitationCode}
          setInvitationCode={setInvitationCode}
          onSubmit={handleOAuthRegistration}
          loading={loading}
        />
      ) : mode === 'githubInvite' ? (
        <OAuthInviteForm
          providerName="GitHub"
          pendingUser={pendingGitHubUser}
          invitationCode={invitationCode}
          setInvitationCode={setInvitationCode}
          onSubmit={handleOAuthRegistration}
          loading={loading}
        />
      ) : mode === 'xInvite' ? (
        <OAuthInviteForm
          providerName="X"
          pendingUser={pendingXUser}
          invitationCode={invitationCode}
          setInvitationCode={setInvitationCode}
          onSubmit={handleOAuthRegistration}
          loading={loading}
        />
      ) : mode === 'resetPassword' ? (
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
      
      {/* OAuth divider and buttons */}
      {mode !== 'resetPassword' && mode !== 'googleInvite' && mode !== 'githubInvite' && mode !== 'xInvite' && (
        <>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">または</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <GoogleLoginButton mode={mode === 'signup' ? 'signup' : 'login'} />
            <GitHubLoginButton mode={mode === 'signup' ? 'signup' : 'login'} />
            <XLoginButton mode={mode === 'signup' ? 'signup' : 'login'} />
          </div>
        </>
      )}
      
      <div className="text-center mb-4">
        {mode === 'googleInvite' ? (
          <div className="space-y-2">
            <button
              onClick={() => {
                setMode('login')
                setMessage('')
                setEmail('')
                setPassword('')
                setName('')
                setInvitationCode('')
                setPendingGoogleUser(null)
                sessionStorage.removeItem('pendingGoogleUser')
              }}
              className="text-blue-500 hover:text-blue-600 text-sm block w-full"
            >
              ログインページに戻る
            </button>
            <button
              onClick={() => {
                setMode('signup')
                setMessage('')
                setEmail('')
                setPassword('')
                setName('')
                setInvitationCode('')
                setPendingGoogleUser(null)
                sessionStorage.removeItem('pendingGoogleUser')
              }}
              className="text-gray-500 hover:text-gray-600 text-sm block w-full"
            >
              メール/パスワードで新規登録
            </button>
          </div>
        ) : mode === 'githubInvite' ? (
          <div className="space-y-2">
            <button
              onClick={() => {
                setMode('login')
                setMessage('')
                setEmail('')
                setPassword('')
                setName('')
                setInvitationCode('')
                setPendingGitHubUser(null)
                sessionStorage.removeItem('pendingGitHubUser')
              }}
              className="text-blue-500 hover:text-blue-600 text-sm block w-full"
            >
              ログインページに戻る
            </button>
            <button
              onClick={() => {
                setMode('signup')
                setMessage('')
                setEmail('')
                setPassword('')
                setName('')
                setInvitationCode('')
                setPendingGitHubUser(null)
                sessionStorage.removeItem('pendingGitHubUser')
              }}
              className="text-gray-500 hover:text-gray-600 text-sm block w-full"
            >
              メール/パスワードで新規登録
            </button>
          </div>
        ) : mode === 'xInvite' ? (
          <div className="space-y-2">
            <button
              onClick={() => {
                setMode('login')
                setMessage('')
                setEmail('')
                setPassword('')
                setName('')
                setInvitationCode('')
                setPendingXUser(null)
                sessionStorage.removeItem('pendingXUser')
              }}
              className="text-blue-500 hover:text-blue-600 text-sm block w-full"
            >
              ログインページに戻る
            </button>
            <button
              onClick={() => {
                setMode('signup')
                setMessage('')
                setEmail('')
                setPassword('')
                setName('')
                setInvitationCode('')
                setPendingXUser(null)
                sessionStorage.removeItem('pendingXUser')
              }}
              className="text-gray-500 hover:text-gray-600 text-sm block w-full"
            >
              メール/パスワードで新規登録
            </button>
          </div>
        ) : mode === 'resetPassword' ? (
          <button
            onClick={() => {
              setMode('login')
              setMessage('')
              setEmail('')
              setPassword('')
              setName('')
              setInvitationCode('')
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
            }}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            {mode === 'signup' ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントをお持ちでない方はこちら'}
          </button>
        )}
      </div>
    </div>
  )
}
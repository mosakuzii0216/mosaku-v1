import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { AuthAPI, AuthTokenManager, UserProfile } from '../utils/auth'
import { GoogleAuthUtils } from '../utils/googleAuth'

export interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string, invitationCode?: string) => Promise<void>;
  googleLogin: () => void;
  googleRegisterWithInvitation: (googleUser: any, invitationCode: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    try {
      // まずGoogle OAuth認証のコールバックをチェック
      const authCallback = GoogleAuthUtils.parseAuthCallback()
      
      if (authCallback.error) {
        console.error('Google auth error:', authCallback.error)
        
        // 招待コードが必要な場合の処理
        if (authCallback.error === 'invitation_required' && authCallback.googleUser) {
          // Google user情報をsessionStorageに保存（招待コード入力で使用）
          sessionStorage.setItem('pendingGoogleUser', JSON.stringify(authCallback.googleUser))
        }
        
        GoogleAuthUtils.clearAuthParams()
        setLoading(false)
        return
      }
      
      if (authCallback.token && authCallback.user) {
        // Google認証成功
        AuthTokenManager.setAccessToken(authCallback.token)
        setUser(authCallback.user)
        GoogleAuthUtils.clearAuthParams()
        setLoading(false)
        return
      }

      // 既存のJWT認証をチェック
      if (AuthTokenManager.isAuthenticated()) {
        const userProfile = await AuthAPI.getCurrentUser()
        setUser(userProfile)
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      AuthTokenManager.removeTokens()
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string): Promise<void> => {
    try {
      const response = await AuthAPI.login(email, password)
      setUser(response.user)
    } catch (error) {
      throw error
    }
  }

  const register = async (
    email: string,
    password: string,
    name?: string,
    invitationCode?: string
  ): Promise<void> => {
    try {
      await AuthAPI.register(email, password, name, invitationCode)
      // Registration successful, but user needs to login
    } catch (error) {
      throw error
    }
  }


  const logout = async (): Promise<void> => {
    // 即座にローカル状態をクリア（UI更新を優先）
    setUser(null)
    AuthTokenManager.removeTokens()
    
    try {
      // バックエンドへのログアウト通知は非同期で実行
      await AuthAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
      // エラーが発生してもローカル状態は既にクリアされているのでそのまま続行
    }
  }

  const resetPassword = async (email: string): Promise<void> => {
    try {
      await AuthAPI.resetPassword(email)
    } catch (error) {
      throw error
    }
  }

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    try {
      await AuthAPI.changePassword(currentPassword, newPassword)
    } catch (error) {
      throw error
    }
  }

  const refreshUser = async (): Promise<void> => {
    try {
      if (AuthTokenManager.isAuthenticated()) {
        const userProfile = await AuthAPI.getCurrentUser()
        setUser(userProfile)
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      setUser(null)
      AuthTokenManager.removeTokens()
    }
  }

  const googleLogin = (): void => {
    try {
      GoogleAuthUtils.startGoogleAuth()
    } catch (error) {
      console.error('Failed to start Google auth:', error)
    }
  }

  const googleRegisterWithInvitation = async (googleUser: any, invitationCode: string): Promise<void> => {
    try {
      const response = await AuthAPI.googleRegisterWithInvitation(googleUser, invitationCode)
      AuthTokenManager.setAccessToken(response.accessToken)
      setUser(response.user)
      // 成功したらpending user情報をクリア
      sessionStorage.removeItem('pendingGoogleUser')
    } catch (error) {
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user && AuthTokenManager.isAuthenticated(),
    login,
    register,
    googleLogin,
    googleRegisterWithInvitation,
    logout,
    resetPassword,
    changePassword,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
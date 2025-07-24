import { useState, useEffect } from 'react'
import { AuthAPI, AuthTokenManager, UserProfile } from '../utils/auth'

export interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string, invitationCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuth = (): AuthState & AuthActions => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    try {
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
    try {
      await AuthAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      AuthTokenManager.removeTokens()
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

  return {
    user,
    loading,
    isAuthenticated: !!user && AuthTokenManager.isAuthenticated(),
    login,
    register,
    logout,
    resetPassword,
    changePassword,
    refreshUser,
  }
}
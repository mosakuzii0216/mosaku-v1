import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface UserProfile {
  id: string
  supabaseId: string
  email: string
  name: string | null
  role: 'FREE' | 'PREMIUM' | 'ADMIN'
  createdAt: string
  updatedAt: string
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        await fetchUserProfile(user)
      }
      
      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        
        if (session?.user) {
          await fetchUserProfile(session.user)
        } else {
          setUserProfile(null)
        }
        
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserProfile = async (authUser: User) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // まずユーザープロフィールを取得を試行
      let response = await fetch('http://localhost/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      // ユーザーが存在しない場合は同期を実行
      if (!response.ok && response.status === 404) {
        await fetch('http://localhost/api/auth/sync-user', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: authUser.user_metadata?.full_name || authUser.email
          })
        })
        
        // 同期後に再度プロフィールを取得
        response = await fetch('http://localhost/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })
      }

      if (response.ok) {
        const profile = await response.json()
        setUserProfile(profile)
      }
    } catch (error) {
      console.error('プロフィール取得エラー:', error)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserProfile(null)
  }

  return {
    user,
    userProfile,
    loading,
    signOut,
    isAuthenticated: !!user,
  }
}
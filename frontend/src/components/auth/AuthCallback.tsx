import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('認証エラー:', error)
        navigate('/auth')
        return
      }

      if (data.session) {
        // ユーザー情報の同期
        await syncUserData(data.session.access_token)
        navigate('/')
      } else {
        navigate('/auth')
      }
    }

    handleAuthCallback()
  }, [navigate])

  const syncUserData = async (accessToken: string) => {
    try {
      const response = await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: ''
        })
      })

      if (!response.ok) {
        console.error('ユーザー同期エラー:', await response.text())
      }
    } catch (error) {
      console.error('ユーザー同期エラー:', error)
    }
  }

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
    </div>
  )
}
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
      // ローカルストレージから招待コードを取得
      const invitationCode = localStorage.getItem('pendingInvitationCode')
      
      // 最初に既存ユーザーかどうかをチェック
      const syncResponse = await fetch('http://localhost/api/auth/sync-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: ''
        })
      })

      if (syncResponse.ok) {
        // 既存ユーザーの場合、招待コードがあっても削除
        if (invitationCode) {
          localStorage.removeItem('pendingInvitationCode')
        }
      } else if (invitationCode) {
        // 新規ユーザーで招待コードがある場合
        const inviteResponse = await fetch('http://localhost/api/auth/sync-user-with-invite', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: '',
            invitationCode
          })
        })

        if (!inviteResponse.ok) {
          const errorText = await inviteResponse.text()
          console.error('新規ユーザー登録エラー:', errorText)
          // 招待コード関連のエラーの場合、招待コード入力画面にリダイレクト
          navigate('/auth?error=invite_required')
          return
        } else {
          // 成功したら招待コードを削除
          localStorage.removeItem('pendingInvitationCode')
        }
      } else {
        // 新規ユーザーで招待コードがない場合、招待コード入力を求める
        console.log('新規ユーザーは招待コードが必要です')
        navigate('/auth?error=invite_required')
        return
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
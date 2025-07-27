import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GoogleLoginButton } from '../ui/GoogleLoginButton';
import { GitHubLoginButton } from '../ui/GitHubLoginButton';

interface OAuthWithInviteFormProps {
  provider: 'google' | 'github';
  onBack: () => void;
}

export default function OAuthWithInviteForm({ provider, onBack }: OAuthWithInviteFormProps) {
  const { googleRegisterWithInvitation, githubRegisterWithInvitation } = useAuth();
  const [invitationCode, setInvitationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const providerName = provider === 'google' ? 'Google' : 'GitHub';
  
  // 招待コードが必要な場合のpending user情報を取得
  const pendingUserKey = provider === 'google' ? 'pendingGoogleUser' : 'pendingGitHubUser';
  const pendingUser = JSON.parse(sessionStorage.getItem(pendingUserKey) || 'null');

  const handleInviteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!invitationCode.trim()) {
      setError('招待コードを入力してください');
      return;
    }

    if (!pendingUser) {
      setError('認証情報が見つかりません。再度認証を行ってください。');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (provider === 'google') {
        await googleRegisterWithInvitation(pendingUser, invitationCode);
      } else {
        await githubRegisterWithInvitation(pendingUser, invitationCode);
      }
    } catch (err: any) {
      setError(err.message || '登録に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 招待コードが必要な場合の表示
  if (pendingUser) {
    return (
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center">
          招待コードを入力
        </h2>
        
        <div className="mb-4 p-3 rounded-lg text-sm bg-blue-100 text-blue-700">
          {providerName}認証が完了しました。アカウントを作成するには招待コードが必要です。
        </div>

        <form onSubmit={handleInviteRegistration}>
          <div className="mb-4">
            <label htmlFor="invitationCode" className="block text-sm font-medium text-gray-700 mb-2">
              招待コード
            </label>
            <input
              type="text"
              id="invitationCode"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="招待コードを入力してください"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '登録中...' : 'アカウント作成'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={onBack}
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  // 通常のOAuth認証開始画面
  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {providerName}でログイン
      </h2>
      
      <div className="mb-6">
        {provider === 'google' ? (
          <GoogleLoginButton />
        ) : (
          <GitHubLoginButton />
        )}
      </div>

      <div className="text-center">
        <button
          onClick={onBack}
          className="text-blue-500 hover:text-blue-600 text-sm"
        >
          戻る
        </button>
      </div>
    </div>
  );
}
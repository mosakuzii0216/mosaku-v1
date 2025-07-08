import { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface OAuthWithInviteFormProps {
  provider: 'google' | 'github';
  onBack: () => void;
}

export default function OAuthWithInviteForm({ provider, onBack }: OAuthWithInviteFormProps) {
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleOAuthWithInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // 招待コードを事前検証
      const response = await fetch('http://localhost/api/invitation/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: invitationCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Invalid invitation code');
      }

      // 招待コードが有効な場合、OAuth認証を開始
      // 招待コードをローカルストレージに保存（認証後に使用）
      localStorage.setItem('pendingInvitationCode', invitationCode);

      const redirectUrl = window.location.port 
        ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}/auth/callback`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl
        }
      });

      if (error) throw error;

    } catch (error: unknown) {
      console.error('OAuth認証エラー:', error);
      setMessage(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const providerName = provider === 'google' ? 'Google' : 'GitHub';

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {providerName}でログイン
      </h2>
      
      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-100 text-red-700">
          {message}
        </div>
      )}

      <form onSubmit={handleOAuthWithInvite} className="space-y-4 mb-6">
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
        
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 ${
            provider === 'google' 
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gray-800 hover:bg-gray-900 text-white'
          }`}
        >
          {loading ? '検証中...' : `${providerName}でログイン`}
        </button>
      </form>

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
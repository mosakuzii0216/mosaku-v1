import { useState } from 'react';

interface OAuthWithInviteFormProps {
  provider: 'google' | 'github';
  onBack: () => void;
}

export default function OAuthWithInviteForm({ provider, onBack }: OAuthWithInviteFormProps) {
  const providerName = provider === 'google' ? 'Google' : 'GitHub';

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {providerName}でログイン
      </h2>
      
      <div className="mb-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-700">
        OAuth認証機能は現在利用できません。メール/パスワード認証をご利用ください。
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
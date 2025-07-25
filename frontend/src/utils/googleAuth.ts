export class GoogleAuthUtils {
  /**
   * Google OAuth認証を開始する
   */
  static startGoogleAuth(): void {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const baseUrl = import.meta.env.VITE_APP_URL || 'http://localhost';
    
    if (!clientId) {
      throw new Error('Google Client ID is not configured');
    }

    // バックエンドのGoogle認証エンドポイントにリダイレクト
    const googleAuthUrl = `${baseUrl}/api/auth/google`;
    window.location.href = googleAuthUrl;
  }

  /**
   * URLからGoogle認証の結果を解析する
   */
  static parseAuthCallback(): { token?: string; user?: any; error?: string; googleUser?: any } {
    const urlParams = new URLSearchParams(window.location.search);
    
    const token = urlParams.get('token');
    const userParam = urlParams.get('user');
    const error = urlParams.get('error');
    const googleUserParam = urlParams.get('google_user');

    if (error) {
      let googleUser = undefined;
      if (googleUserParam) {
        try {
          googleUser = JSON.parse(decodeURIComponent(googleUserParam));
        } catch (parseError) {
          console.error('Failed to parse google user data:', parseError);
        }
      }
      return { error, googleUser };
    }

    if (token && userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        return { token, user };
      } catch (parseError) {
        console.error('Failed to parse user data:', parseError);
        return { error: 'Failed to parse authentication data' };
      }
    }

    return {};
  }

  /**
   * URLからGoogle認証パラメータをクリアする
   */
  static clearAuthParams(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('user');
    url.searchParams.delete('error');
    url.searchParams.delete('google_user');
    
    // パラメータが変更された場合のみURLを更新
    if (url.search !== window.location.search) {
      window.history.replaceState({}, '', url.toString());
    }
  }
}
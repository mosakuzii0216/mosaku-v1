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

    // Google固有のパラメータがない場合は、Google認証ではないと判断
    if (!googleUserParam && error) {
      return {};
    }

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

export class GitHubAuthUtils {
  /**
   * GitHub OAuth認証を開始する
   */
  static startGitHubAuth(): void {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    const baseUrl = import.meta.env.VITE_APP_URL || 'http://localhost';
    
    if (!clientId) {
      throw new Error('GitHub Client ID is not configured');
    }

    // バックエンドのGitHub認証エンドポイントにリダイレクト
    const githubAuthUrl = `${baseUrl}/api/auth/github`;
    window.location.href = githubAuthUrl;
  }

  /**
   * URLからGitHub認証の結果を解析する
   */
  static parseAuthCallback(): { token?: string; user?: any; error?: string; githubUser?: any } {
    const urlParams = new URLSearchParams(window.location.search);
    
    const token = urlParams.get('token');
    const userParam = urlParams.get('user');
    const error = urlParams.get('error');
    const githubUserParam = urlParams.get('github_user');

    // GitHub固有のパラメータがない場合は、GitHub認証ではないと判断
    if (!githubUserParam && error) {
      return {};
    }

    if (error) {
      let githubUser = undefined;
      if (githubUserParam) {
        try {
          githubUser = JSON.parse(decodeURIComponent(githubUserParam));
        } catch (parseError) {
          console.error('Failed to parse github user data:', parseError);
        }
      }
      return { error, githubUser };
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
   * URLからGitHub認証パラメータをクリアする
   */
  static clearAuthParams(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('user');
    url.searchParams.delete('error');
    url.searchParams.delete('github_user');
    
    // パラメータが変更された場合のみURLを更新
    if (url.search !== window.location.search) {
      window.history.replaceState({}, '', url.toString());
    }
  }
}

export class XAuthUtils {
  /**
   * X OAuth認証を開始する
   */
  static startXAuth(): void {
    const consumerKey = import.meta.env.VITE_X_CONSUMER_KEY;
    const baseUrl = import.meta.env.VITE_APP_URL || 'http://localhost';
    
    if (!consumerKey) {
      throw new Error('X Consumer Key is not configured');
    }

    // バックエンドのX認証エンドポイントにリダイレクト
    const xAuthUrl = `${baseUrl}/api/auth/x`;
    window.location.href = xAuthUrl;
  }

  /**
   * URLからX認証の結果を解析する
   */
  static parseAuthCallback(): { token?: string; user?: any; error?: string; xUser?: any } {
    const urlParams = new URLSearchParams(window.location.search);
    
    const token = urlParams.get('token');
    const userParam = urlParams.get('user');
    const error = urlParams.get('error');
    const xUserParam = urlParams.get('x_user');

    // X固有のパラメータがない場合は、X認証ではないと判断
    if (!xUserParam && error) {
      return {};
    }

    if (error) {
      let xUser = undefined;
      if (xUserParam) {
        try {
          xUser = JSON.parse(decodeURIComponent(xUserParam));
        } catch (parseError) {
          console.error('Failed to parse x user data:', parseError);
        }
      }
      return { error, xUser };
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
   * URLからX認証パラメータをクリアする
   */
  static clearAuthParams(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('user');
    url.searchParams.delete('error');
    url.searchParams.delete('x_user');
    
    // パラメータが変更された場合のみURLを更新
    if (url.search !== window.location.search) {
      window.history.replaceState({}, '', url.toString());
    }
  }
}
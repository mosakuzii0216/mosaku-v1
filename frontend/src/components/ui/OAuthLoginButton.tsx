import { useAuth } from '../../contexts/AuthContext';

type OAuthProvider = 'google' | 'github' | 'line' | 'apple' | 'x';

interface OAuthLoginButtonProps {
	provider: OAuthProvider;
	className?: string;
	children?: React.ReactNode;
	mode?: 'login' | 'signup';
	variant?: 'default' | 'forest';
}

interface ProviderConfig {
	name: string;
	loginFn: () => void;
	icon: React.ReactNode;
	bgColor: string;
	hoverColor: string;
	textColor: string;
}

const GoogleIcon = () => (
	<svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
		<path
			fill="#4285F4"
			d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
		/>
		<path
			fill="#34A853"
			d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
		/>
		<path
			fill="#FBBC05"
			d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
		/>
		<path
			fill="#EA4335"
			d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
		/>
	</svg>
);

const GitHubIcon = () => (
	<svg
		className="w-5 h-5 mr-3"
		fill="currentColor"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			fillRule="evenodd"
			d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
			clipRule="evenodd"
		/>
	</svg>
);

const LINEIcon = () => (
	<svg
		className="w-5 h-5 mr-3"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		fill="#06C755"
	>
		<path d="M12 2C6.48 2 2 6.04 2 11c0 3.31 1.97 6.22 4.97 7.97-.07.25-.44 1.57-.51 1.82-.08.29.11.28.22.2.09-.06 1.4-.94 1.97-1.32.77.12 1.56.18 2.35.18 5.52 0 10-4.04 10-9s-4.48-9-10-9zm-3.5 12H6.75v-5h1.75v5zm4.25 0H11v-3.25L9.5 13v-1.5l1.5.01V9h1.75v5zm3.5 0h-1.75l-2-3v3H10.75V9H12.5l1.75 2.75V9H16v5z" />
	</svg>
);

const AppleIcon = () => (
	<svg
		className="w-5 h-5 mr-3"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		fill="currentColor"
	>
		<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
	</svg>
);

const XIcon = () => (
	<svg
		className="w-5 h-5 mr-3"
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		fill="currentColor"
	>
		<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
	</svg>
);

export const OAuthLoginButton: React.FC<OAuthLoginButtonProps> = ({
	provider,
	className = '',
	children,
	mode = 'login',
	variant = 'default',
}) => {
	const { googleLogin, githubLogin, lineLogin, appleLogin, xLogin } = useAuth();

	const providerConfigs: Record<OAuthProvider, ProviderConfig> = {
		google: {
			name: 'Google',
			loginFn: googleLogin,
			icon: <GoogleIcon />,
			bgColor: 'bg-white',
			hoverColor: 'hover:bg-gray-50',
			textColor: 'text-gray-700',
		},
		github: {
			name: 'GitHub',
			loginFn: githubLogin,
			icon: <GitHubIcon />,
			bgColor: 'bg-gray-900',
			hoverColor: 'hover:bg-gray-800',
			textColor: 'text-white',
		},
		line: {
			name: 'LINE',
			loginFn: lineLogin,
			icon: <LINEIcon />,
			bgColor: 'bg-white',
			hoverColor: 'hover:bg-gray-50',
			textColor: 'text-gray-700',
		},
		apple: {
			name: 'Apple',
			loginFn: appleLogin,
			icon: <AppleIcon />,
			bgColor: 'bg-black',
			hoverColor: 'hover:bg-gray-900',
			textColor: 'text-white',
		},
		x: {
			name: 'X',
			loginFn: xLogin,
			icon: <XIcon />,
			bgColor: 'bg-black',
			hoverColor: 'hover:bg-gray-900',
			textColor: 'text-white',
		},
	};

	const config = providerConfigs[provider];
	const defaultText = mode === 'signup' ? `${config.name}で登録` : `${config.name}でログイン`;

	const forestStyles = 'bg-black/40 border border-green-700 text-green-100 hover:bg-black/60';
	const defaultStyles = `border border-gray-300 shadow-sm ${config.bgColor} ${config.textColor} ${config.hoverColor}`;
	const variantStyles = variant === 'forest' ? forestStyles : defaultStyles;

	return (
		<button
			onClick={config.loginFn}
			className={`
        flex items-center justify-center w-full px-4 py-2
        rounded-lg text-sm font-medium
        ${variantStyles} transition-colors duration-200
        ${className}
      `}
		>
			{config.icon}
			{children || defaultText}
		</button>
	);
};

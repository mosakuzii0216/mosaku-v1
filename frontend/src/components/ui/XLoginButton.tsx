import { useAuth } from '../../contexts/AuthContext'

interface XLoginButtonProps {
  className?: string
  children?: React.ReactNode
}

export const XLoginButton: React.FC<XLoginButtonProps> = ({ 
  className = '', 
  children 
}) => {
  const { xLogin } = useAuth()

  const handleXLogin = () => {
    xLogin()
  }

  return (
    <button
      onClick={handleXLogin}
      className={`
        flex items-center justify-center w-full px-4 py-2 border border-gray-300 
        rounded-lg shadow-sm bg-black text-sm font-medium text-white 
        hover:bg-gray-900 transition-colors duration-200
        ${className}
      `}
    >
      <svg
        className="w-5 h-5 mr-3"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
      {children || 'Xでログイン'}
    </button>
  )
}
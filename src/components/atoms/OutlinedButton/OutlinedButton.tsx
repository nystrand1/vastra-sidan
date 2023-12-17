


export const OutlinedButton = ({ children, onClick, className = '', disabled, type, ...props } :  React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      onClick={onClick}
      className={`border focus:ring-4 focus:outline-nonefont-medium rounded-lg text-sm px-5 py-2.5 text-center mb-2 border-blue-500 text-blue-500 hover:text-white hover:bg-blue-500 focus:ring-blue-800 ${className}`}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}
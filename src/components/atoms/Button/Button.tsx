export const Button = ({ children, onClick, className, disabled, type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      onClick={onClick}
      className={`text-slate-100 bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-md text-sm px-5 py-2.5 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800 disabled:bg-slate-500 disabled:hover:bg-slate-500 ${className ?? ''}`}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
};
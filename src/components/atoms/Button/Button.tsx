export const Button = ({ children, onClick, className, disabled, type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <button
      onClick={onClick}
      className={`text-slate-100 focus:ring-4 font-medium rounded-md text-sm px-5 py-2.5 mb-2 bg-[#1e599f] hover:bg-[#164174] focus:outline-none focus:ring-blue-800 disabled:bg-slate-500 disabled:hover:bg-slate-500 ${className ?? ''}`}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
};
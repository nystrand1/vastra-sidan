import Link, { type LinkProps } from "next/link"

export const ButtonLink = ({className, children, ...props} : LinkProps & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  return (
    <Link
    className={`text-slate-100 text-center focus:ring-4 font-medium rounded-md text-sm px-5 py-2.5 mb-2 bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-blue-800 ${className ?? ''}`}
    {...props}
   >
      {children}
    </Link>
  )
}
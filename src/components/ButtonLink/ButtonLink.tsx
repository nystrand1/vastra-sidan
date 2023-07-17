import Link, { type LinkProps } from "next/link"

export const ButtonLink = ({className, ...props} : LinkProps & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  return (
    <Link
    className={`text-slate-100 text-center bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-md text-sm px-5 py-2.5 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800 ${className}`}
    {...props}
   >
      {props.children}
    </Link>
  )
}
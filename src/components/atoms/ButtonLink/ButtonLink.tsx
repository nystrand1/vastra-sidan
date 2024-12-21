import Link from "next/link"
import { Button, type ButtonProps } from "~/components/ui/button"

interface ButtonLinkProps extends ButtonProps {
  href: string
  target?: string
}

export const ButtonLink = ({ children, href, target, ...props }: ButtonLinkProps) => {
  return (
    <Button {...props} asChild>
      <Link href={href} target={target} className="w-full h-full">
        {children}
      </Link>
    </Button>
  )
}
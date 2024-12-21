import Link from 'next/link';
import { type PropsWithChildren } from "react";
import { twMerge } from 'tailwind-merge';
import { Card, CardContent, CardHeader } from '~/components/ui/card'

interface CardLinkProps extends PropsWithChildren {
  title?: string;
  href?: string;
  target?: string;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  titleAsH1?: boolean;
}

const CardLink = ({ title, href, target, className, children, contentClassName, titleClassName, titleAsH1 }: CardLinkProps) => {
  const card = (
    <Card className={`overflow-hidden ${href ? 'cursor-pointer' : ''} ${className || ''}`}>
      <CardHeader>
        {title && (
          titleAsH1 ? (
              <h1 className={`text-xl font-semibold ${titleClassName || ''}`}>{title}</h1>
            ) : (
              <h2 className={`text-xl font-semibold ${titleClassName || ''}`}>{title}</h2>
            )
        )}
      </CardHeader>
      <CardContent className={twMerge("[&_button]:w-full space-y-4", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link className="block" href={href} target={target}>
        {card}
      </Link>
    )
  }

  return card;
};

export default CardLink;
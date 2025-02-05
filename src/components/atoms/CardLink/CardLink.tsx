import Link from 'next/link';
import { type PropsWithChildren } from "react";
import { twMerge } from 'tailwind-merge';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader } from '~/components/ui/card'

interface CardLinkProps extends PropsWithChildren {
  title?: string;
  href?: string;
  target?: string;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  titleAsH1?: boolean;
  badge?: string;
}

const CardLink = ({ title, badge, href, target, className, children, contentClassName, titleClassName, titleAsH1 }: CardLinkProps) => {
  const card = (
    <Card className={`overflow-hidden ${href ? 'cursor-pointer' : ''} ${className || ''}`}>
      <CardHeader className='flex flex-row justify-between'>
        {title && (
          titleAsH1 ? (
              <h1 className={`text-xl font-semibold ${titleClassName || ''}`}>{title}</h1>
            ) : (
              <h2 className={`text-xl font-semibold ${titleClassName || ''}`}>{title}</h2>
            )
        )}
        {badge && (
          <Badge className='w-fit'>{badge}</Badge>
        )}
      </CardHeader>
      <CardContent className={twMerge("space-y-4", contentClassName)}>
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
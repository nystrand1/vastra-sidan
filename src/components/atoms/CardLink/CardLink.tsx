import Link from 'next/link';
import { type PropsWithChildren } from "react";

interface CardProps extends PropsWithChildren {
  title?: string;
  link?: string;
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
}

const Card = ({ title, link, className, children, contentClassName, titleClassName }: CardProps) => {
  const content = (
    <div className={`flex flex-col justify-between space-y-4 ${contentClassName || ''}`}>
      {title && (
        <h2 className={`text-xl font-semibold ${titleClassName || ''}`}>{title}</h2>
      )}
      {children}
    </div>
  )
  return (
    <div className={`bg-slate-800 text-slate-50 rounded-lg shadow-md p-4 overflow-hidden ${link ? 'cursor-pointer' : ''} ${className || ''}`}>
      {link ? (
        <Link href={link}>
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
};

export default Card;
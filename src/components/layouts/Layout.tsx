import React, { type PropsWithChildren } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { Navigation } from './Navigation';
import { twMerge } from 'tailwind-merge';

interface LayoutProps extends PropsWithChildren {
  className?: string
}

const Layout = ({ children, className } : LayoutProps) => {
  return (
    <div className="bg-black text-white">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Navigation />
      <div className="z-10 fixed w-screen h-screen bg-slate-900 opacity-70"/>
      <div className="fixed w-screen h-screen bg-right md:hidden">
        <Image style={{objectFit: 'cover'}} src="/static/background_mobile.webp" fill alt="Uppsala det är staden"/>
      </div>
      <div className="fixed w-screen h-screen bg-right hidden md:block">
        <Image style={{objectFit: 'cover'}} src="/static/background.webp" fill alt="Uppsala det är staden"/>
      </div>
      <main className={twMerge("flex min-h-screen flex-col items-center justify-center z-10 relative", className)}>
        <div className="container p-4 md:p-8 mt-16 md:mt-12">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
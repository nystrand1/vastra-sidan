import React, { type PropsWithChildren } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { Navigation } from './Navigation';

const Layout = ({ children } : PropsWithChildren) => {
  return (
    <div className="bg-black text-white">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Navigation />
      <div className="z-10 fixed w-screen h-screen bg-slate-900 opacity-70"/>
      <div className="fixed w-screen h-screen bg-right md:hidden">
        <Image objectFit='cover' src="/static/background_mobile.webp" fill alt="Uppsala det är staden"/>
      </div>
      <div className="fixed w-screen h-screen bg-right hidden md:block">
        <Image objectFit='cover' src="/static/background.webp" fill alt="Uppsala det är staden"/>
      </div>
      <main className="flex min-h-screen flex-col items-center justify-center z-10 relative">
        <div className="container p-4 md:p-8 mt-16">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
import React, { type PropsWithChildren } from 'react';
import Head from 'next/head';

const Layout = ({ children } : PropsWithChildren) => {
  return (
    <div className="bg-black text-white">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="fixed w-screen h-screen bg-gradient-to-b from-[#051b97] to-[#000000]"/>
      <main className="flex min-h-screen flex-col items-center justify-center z-10 relative">
        <div className="container p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
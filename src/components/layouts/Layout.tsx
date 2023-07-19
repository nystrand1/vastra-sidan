import React, { type PropsWithChildren } from 'react';
import Head from 'next/head';

const Layout = ({ children } : PropsWithChildren) => {
  return (
    <div className="bg-black text-white">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0220c9] to-[#000000]">
        <div className="container">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
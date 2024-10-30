import { setDefaultOptions } from "date-fns";
import { sv } from "date-fns/locale/sv";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { type AppType } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import Script from "next/script";
import { Toaster } from "react-hot-toast";
import AdminLayout from "~/components/layouts/AdminLayout";
import Layout from "~/components/layouts/Layout";
import "~/styles/globals.css";
import { api } from "~/utils/api";
import { featureFlags } from "~/utils/featureFlags";
setDefaultOptions({ locale: sv });

 
const MyApp: AppType<{ session: Session | null}> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  const { route } = useRouter();
  const isAdminRoute = route.includes('/admin');
  return (
    <> 
    <Head>
      <link rel="icon" href="/favicon/favicon.ico" />
      <link rel="apple-touch-icon" sizes="57x57" href="/favicon/apple-icon-57x57.png" />
      <link rel="apple-touch-icon" sizes="60x60" href="/favicon/apple-icon-60x60.png" />
      <link rel="apple-touch-icon" sizes="72x72" href="/favicon/apple-icon-72x72.png" />
      <link rel="apple-touch-icon" sizes="76x76" href="/favicon/apple-icon-76x76.png" />
      <link rel="apple-touch-icon" sizes="114x114" href="/favicon/apple-icon-114x114.png" />
      <link rel="apple-touch-icon" sizes="120x120" href="/favicon/apple-icon-120x120.png" />
      <link rel="apple-touch-icon" sizes="144x144" href="/favicon/apple-icon-144x144.png" />
      <link rel="apple-touch-icon" sizes="152x152" href="/favicon/apple-icon-152x152.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-icon-180x180.png" />
      <link rel="icon" type="image/png" sizes="192x192"  href="/favicon/android-icon-192x192.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
      <link rel="icon" type="image/png" sizes="96x96" href="/favicon/favicon-96x96.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
    </Head>
    <SessionProvider session={session}>
      {featureFlags.ENABLE_ANALYTICS && (
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-P1J3LPRH51" />       
      )}
      {featureFlags.ENABLE_ANALYTICS && (
        <Script
          id="gtag"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());

              gtag('config', 'G-P1J3LPRH51');
            `
          }}
        />
      )}
      <Toaster 
        position="bottom-center" 
        toastOptions={{
          style: {
            borderRadius: '10px',
            background: '#333',
            color: '#fff',
          },
          className: "sentry-unmask"
      }} />
      <Layout>
        {isAdminRoute ? (
          <AdminLayout>
            <Component {...pageProps} />
          </AdminLayout>
        ) : (
          <Component {...pageProps} />
        )}
      </Layout>
    </SessionProvider>
    </>
  );
};

export default api.withTRPC(MyApp);

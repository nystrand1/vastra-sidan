import Head from "next/head";
import Link from "next/link";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";


export const AboutUsPage = () => {
  const { data } = api.wordpress.getAboutUsPage.useQuery();

  if (!data) return null;

  const { documents, board, protocols } = data;

  const seoDescription = "Västra Sidan är en supporterförening till IK Sirius. Vi är en ideell förening som arbetar för att skapa en bättre upplevelse för IK Sirius supportrar."

  return (
    <>
      <Head>
        <title>Om oss | Västra Sidan</title>
        <meta name="title" key="title" content="Om oss | Västra Sidan" />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Om oss</h1>
        <div className="flex flex-col md:flex-row justify-center md:space-x-5 py-6 text-lg underline underline-offset-4">
          <Link className="hover:text-gray-200" href="/omoss/stadgar">
            Stadgar
          </Link>
          <Link className="hover:text-gray-200" href="/bortaresor/regler">
            Regler för bortaresor
          </Link>
          <Link className="hover:text-gray-200" href="/omoss/wall-of-fame">
            Wall of fame
          </Link>
        </div>
        <div className="flex justify-center space-x-5 pb-6 text-lg">
          <p className="md:hidden">Swishnummer: <Link target="_blank" className="hover:text-gray-200 underline underline-offset-4" href="https://app.swish.nu/1/p/sw/?sw=1232314342">123 231 43 42</Link></p>
          <p className="hidden md:block">Swishnummer: <span className="underline underline-offset-4">123 231 43 42</span></p>
        </div>
        <div className="grid md:grid-cols-2 gap-4 md:items-stretch flex-wrap justify-center w-full md:w-10/12 m-auto">
          <Card
            title="Styrelsen"
            titleClassName="text-center !text-2xl"
            className="order-2 md:order-1"
          >
            <div className="grid md:grid-cols-2 gap-4">
              {board.boardmembers.map((member) => (
                <div key={member.details.name}>
                  <p className="font-semibold">{member.details.position}</p>
                  <p>{member.details.name}</p>
                  <a className="underline" href={`mailto:${member.details.email}`}>{member.details.email}</a>
                </div>
              ))}
            </div>
            <div>
              Styrelsen kontaktas i första hand via mejl: <a className="underline" href="mailto:info@vastrasidan.se">info@vastrasidan.se</a>
            </div>
          </Card>
          <Card
            title="Dokument & Protokoll"
            titleClassName="text-center !text-2xl"
            className="order-1 md:order-2"
          >
            <div className="grid grid-cols-2">
              <div>
                <p className="font-semibold">Dokument</p>
                <div className="grid gap-2 !mt-0">
                  {documents.map((doc) => (
                    <a key={doc.file.title} className="text-sm underline overflow-hidden text-ellipsis" href={doc.file.mediaItemUrl} target="_blank" download>{doc.file.title}</a>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-semibold">Protokoll</p>
                <div className="grid gap-2 !mt-0">
                  {protocols.map((protocol) => (
                    <a key={protocol.file.title} className="text-sm underline overflow-hidden text-ellipsis" href={protocol.file.mediaItemUrl} target="_blank" download>{protocol.file.title}</a>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

export default AboutUsPage;

export async function getStaticProps() {
  const ssrHelper = await createSSRHelper();

  await ssrHelper.wordpress.getAboutUsPage.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 3600 * 24,
  }
}

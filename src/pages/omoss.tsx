import Head from "next/head";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";


export const AboutUsPage = () => {
  const { data } = api.wordpress.getAboutUsPage.useQuery();

  if (!data) return null;

  const { documents, board, wallOfFame, orgChart } = data;
  console.log(documents);
  return (
    <>
      <Head>
        <title>Om oss | Västra Sidan</title>
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Bortaguiden</h1>
        <div className="grid grid-cols-3 gap-4 md:items-stretch flex-wrap justify-center">
          <Card
            title="Styrelsen"
          >
            <div className="grid grid-cols-2 gap-4">
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
            >
            <p className="font-semibold">Dokument</p>
            <div className="grid grid-cols-1 gap-2 !mt-0">
              {documents.map((doc) => (
                <div key={doc.file.title}>
                  <a className="text-sm underline" href={doc.file.mediaItemUrl} target="_blank" download>{doc.file.title}</a>
                </div>
              ))}
              </div>
            <p className="font-semibold">Protokoll</p>
            
            </Card>
        </div>
      </div>
    </>
  )
}

export default AboutUsPage;
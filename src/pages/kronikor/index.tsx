import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";

export default function ChroniclesPage() {
  const { data: chronicles } = api.wordpress.getChronicles.useQuery();
  if (!chronicles) {
    return <p className="text-center text-xl">Finns inga kronikor för tillfället!</p>
  }
  return (
    <div>
      <h1 className="text-center mb-4 text-5xl">Krönikor</h1>
      <div className="flex flex-col md:flex-row gap-4 md:items-stretch">
        {chronicles?.map(({ slug, chronicle, date, excerpt }) => (
          <Card title={chronicle.title} key={slug} className="w-full md:w-[1/3]" contentClassName="justify-start">
            <p className="text-gray-400">{date}</p>
            <Wysiwyg content={excerpt} />
            <ButtonLink className="justify-end" href={`/kronikor/${slug}`}>Läs mer</ButtonLink>
          </Card>
        ))}
      </div>
    </div>
  );
}
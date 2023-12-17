import { api } from "~/utils/api";




export default function ChroniclesPage() {
  const { data: chronicles } = api.wordpress.getChronicles.useQuery();
  console.log(chronicles);
  if (!chronicles) {
    return <p className="text-center text-xl">Finns inga kronikor för tillfället!</p>
  }
  return (
    <div>
      <h1>Kronikor</h1>
      <div>
        {chronicles?.map(({ slug, chronicle }) => (
          <div key={slug}>
            <h2>{chronicle.title}</h2>
            <div dangerouslySetInnerHTML={{ __html: chronicle.text }} />
          </div>
        ))}
      </div>
    </div>
  );
}
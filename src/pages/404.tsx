import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";



export const NotFoundPage = () => {
  return (
    <div className="flex flex-col justify-center">
      <h1 className="text-4xl text-center">404 Dalkurd not found</h1>
      <ButtonLink href="/" className="mt-10 w-full md:w-fit mx-auto">
        Tillbaka till säkerhet
      </ButtonLink>
    </div>
  )
}

export default NotFoundPage;
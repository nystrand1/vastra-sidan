import { useSession } from "next-auth/react";
import Card from "~/components/atoms/CardLink/CardLink";
import LoginPage from "./loggain";
import { InputField } from "~/components/atoms/InputField/InputField";
import { Button } from "~/components/atoms/Button/Button";


export const ProfilePage = () => {
  const { data } = useSession();

  const { user } = data || {};

  if (!user) {
    return <LoginPage />
  }

  console.log('data', data);

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:items-start flex-wrap justify-center w-full md:w-10/12 lg:w-3/4 m-auto">
      <Card 
        title="Min profil"
        className="w-full mx-auto"
      >
        <form className="space-y-4">
          <InputField 
            label="Förnamn"
            placeholder="Förnamn..."
            value={user.firstName}
          />
          <InputField
            label="Efternamn"
            placeholder="Efternamn..."
            value={user.lastName}
          />
          <InputField
            type="email"
            label="Email"
            placeholder="Email..."
            value={user.email}
          />
          <InputField
            type="tel"
            label="Telefonnummer"
            placeholder="Telefonnummer..."
            value={user.phone} 
          />
          <Button className="w-full" type="submit">Spara</Button>
        </form>
      </Card>
      <Card 
        title="Ändra lösenord"
        className="w-full mx-auto"
      >
        <form className="space-y-4">
          <InputField
            type="password"
            label="Nuvarande lösenord"
            placeholder="Nuvarande lösenord..."
          />
          <InputField
              type="password"
              label="Lösenord"
              placeholder="Lösenord..."
            />
          <InputField
            type="password"
            label="Bekräfta lösenord"
            placeholder="Bekräfta lösenord..."
          />
          <Button className="w-full" type="submit">Spara</Button>
        </form>
      </Card>
    </div>
  )
}

export default ProfilePage;
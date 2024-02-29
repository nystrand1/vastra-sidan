import { useSession } from "next-auth/react";
import Card from "~/components/atoms/CardLink/CardLink";
import LoginPage from "./loggain";
import { InputField } from "~/components/atoms/InputField/InputField";
import { Button } from "~/components/atoms/Button/Button";
import { useEffect, useState } from "react";
import { profileSchema } from "~/utils/zodSchemas";
import toast from "react-hot-toast";
import { api } from "~/utils/api";

interface Profile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;

}

export const ProfilePage = () => {
  const { data, update } = useSession();
  const { user } = data || {};
  const [profile, setProfile] = useState<Profile>({} as Profile);

  const { mutateAsync: updateProfile } = api.user.updateProfile.useMutation();

  useEffect(() => {
    setProfile({
      firstName: user?.firstName,
      lastName: user?.lastName,
      email: user?.email,
      phone: user?.phone
    });
  }, [user]);

  if (!user) {
    return <LoginPage />
  }


  const submitProfileUpdate = async(e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const parseProfile = profileSchema.safeParse(profile);

    if (!parseProfile.success) {
      parseProfile.error.issues.map((x) => toast.error(x.message))
      return;
    }

    await toast.promise(updateProfile(parseProfile.data), {
      loading: 'Sparar...',
      success: 'Profil uppdaterad!',
      error: 'Något gick fel!'
    });
    await update({
      user: {
        ...user,
        ...parseProfile.data,
      }
    });
  };

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:items-start flex-wrap justify-center w-full md:w-10/12 lg:w-3/4 m-auto">
      <Card 
        title="Min profil"
        className="w-full mx-auto"
      >
        <form className="space-y-4" onSubmit={submitProfileUpdate}>
          <InputField 
            label="Förnamn"
            placeholder="Förnamn..."
            value={profile?.firstName}
            onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
          />
          <InputField
            label="Efternamn"
            placeholder="Efternamn..."
            value={profile?.lastName}
            onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
          />
          <InputField
            type="email"
            label="Email"
            placeholder="Email..."
            value={profile?.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
          <InputField
            type="tel"
            label="Telefonnummer"
            placeholder="Telefonnummer..."
            value={profile?.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
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
import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { InputField } from "~/components/atoms/InputField/InputField";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "~/components/ui/dialog";
import { api } from "~/utils/api";
import { type AppSession } from "~/utils/appSession";
import { authClient, useAppSession } from "~/utils/authClient";
import { isProfileComplete } from "~/utils/profile";
import { profileSchema } from "~/utils/zodSchemas";
import LoginPage from "./loggain";

type Prefill = { firstName: string; lastName: string; phone: string } | null | undefined;

const ProfileForm = ({
  user,
  prefill,
  complete,
  refetch
}: {
  user: AppSession["user"];
  prefill: Prefill;
  complete: boolean;
  refetch: () => Promise<void>;
}) => {
  const [profile, setProfile] = useState({
    firstName: user.firstName || prefill?.firstName || "",
    lastName: user.lastName || prefill?.lastName || "",
    phone: user.phone || prefill?.phone || ""
  });
  const { mutateAsync: updateProfile } = api.user.updateProfile.useMutation();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => toast.error(issue.message));
      return;
    }
    await toast.promise(updateProfile(parsed.data), {
      loading: "Sparar...",
      success: "Profil uppdaterad!",
      error: "Något gick fel!"
    });
    // Reloads the session from the database, which now has the new profile.
    await refetch();
  };

  return (
    <Card title={complete ? "Profil" : "Välkommen!"} titleAsH1 className="w-full mx-auto">
      <form className="space-y-4" onSubmit={submit}>
        {!complete && <p>Fyll i dina uppgifter för att fortsätta.</p>}
        <InputField
          label="Förnamn"
          placeholder="Förnamn..."
          autoComplete="given-name"
          value={profile.firstName}
          onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
        />
        <InputField
          label="Efternamn"
          placeholder="Efternamn..."
          autoComplete="family-name"
          value={profile.lastName}
          onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
        />
        <InputField
          type="tel"
          label="Telefonnummer"
          placeholder="Telefonnummer..."
          autoComplete="tel"
          value={profile.phone}
          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
        />
        <div>
          <InputField type="email" label="Email" value={user.email} readOnly disabled />
          <p className="mt-1 text-sm">Kontakta styrelsen för att byta email</p>
        </div>
        <Button className="w-full" type="submit">
          Spara
        </Button>
      </form>
    </Card>
  );
};

const Passkeys = () => {
  const { data: passkeys, refetch } = authClient.useListPasskeys();

  const add = async () => {
    const result = await authClient.passkey.addPasskey();
    if (result?.error) {
      toast.error("Det gick inte att lägga till passkey.");
      return;
    }
    toast.success("Passkey tillagd!");
    await refetch();
  };

  const remove = async (id: string) => {
    const result = await authClient.passkey.deletePasskey({ id });
    if (result.error) {
      toast.error("Något gick fel!");
      return;
    }
    await refetch();
  };

  return (
    <Card title="Passkeys" className="w-full mx-auto">
      <div className="space-y-4">
        {passkeys && passkeys.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex items-center justify-between py-2">
                <span>{passkey.name ?? "Passkey"}</span>
                <Button variant="outlineDestructive" onClick={() => remove(passkey.id)}>
                  Ta bort
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button className="w-full" onClick={add}>
          Lägg till passkey
        </Button>
      </div>
    </Card>
  );
};

const Danger = () => {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { mutateAsync: deleteAccount, isPending } = api.user.deleteAccount.useMutation();

  const signOutEverywhere = async () => {
    const { error } = await authClient.revokeSessions();
    if (error) {
      toast.error("Något gick fel!");
      return;
    }
    await router.push("/");
  };

  const confirmDelete = async () => {
    try {
      await deleteAccount();
    } catch {
      toast.error("Något gick fel!");
      return;
    }
    await router.push("/");
  };

  return (
    <Card title="Konto" className="w-full mx-auto">
      <div className="space-y-4">
        <Button className="w-full" variant="outline" onClick={signOutEverywhere}>
          Logga ut på alla enheter
        </Button>
        <Button className="w-full" variant="outlineDestructive" onClick={() => setConfirming(true)}>
          Radera konto
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Radera konto</DialogTitle>
            <DialogDescription>
              Dina bokningar och medlemskap sparas, men du kan inte längre se dem här.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={confirmDelete}>
              Radera konto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export const ProfilePage = () => {
  const { user, isPending, refetch } = useAppSession();
  const complete = user ? isProfileComplete(user) : true;
  const { data: prefill, isLoading: prefillLoading } = api.user.getProfilePrefill.useQuery(
    undefined,
    { enabled: !!user && !complete }
  );

  if (isPending || (user && !complete && prefillLoading)) {
    return <p className="text-center">Laddar...</p>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:items-start justify-center w-full md:w-10/12 lg:w-3/4 m-auto">
      <ProfileForm
        // Remount with fresh values after a save changes completeness.
        key={String(complete)}
        user={user}
        prefill={prefill}
        complete={complete}
        refetch={refetch}
      />
      {complete && (
        <>
          <Passkeys />
          <Danger />
        </>
      )}
    </div>
  );
};

export default ProfilePage;

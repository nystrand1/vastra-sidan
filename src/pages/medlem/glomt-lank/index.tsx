import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { api } from "~/utils/api";



export default function GetMembershipPage() {
  const [email, setEmail] = useState('');
  const { mutateAsync: sendLink } = api.member.sendMembershipLink.useMutation();

  const handleSendLink = async () => {
    await toast.promise(
      sendLink({ email }),
      {
        loading: 'Skickar länk...',
        success: 'Länk skickad! Kolla din mail.',
        error: 'Något gick fel. Kolla att du har skrivit in rätt mail och att du har ett aktivt medlemskap.'
      }
    )
  };

  return (
    <Card className="w-full md:w-96 mx-auto">
      <CardHeader>
        <h1 className="text-2xl font-bold">Hämta medlemskap</h1>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>Om du har tappat bort länken till ditt medlemskap, eller inte fått den, så kan du klicka på knappen nedan för att få en ny länk skickad till din mail.</p>
        <p>Fungerar endast om du har ett aktivt medlemskap.</p>
        <Input
          placeholder="Din mail"
          className="max-w-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          onClick={handleSendLink}
        >
          Skicka länk
        </Button>
      </CardContent>
    </Card>
  )
}
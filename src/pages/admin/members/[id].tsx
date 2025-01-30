import { Role } from "@prisma/client";
import { IdCardIcon, MailIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import Card from "~/components/atoms/CardLink/CardLink";
import { Button } from "~/components/ui/button";
import { api } from "~/utils/api";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

export default function AdminMemberPage() {
  const { data: sessionData } = useSession();
  const { query } = useRouter();
  const { data: member } = api.admin.getMemberById.useQuery(
    { id: query.id as string },
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN && !!query.id }
  );
  const { mutateAsync: sendMemberLink, isPending } = api.admin.sendMemberLink.useMutation();

  
  if (!member) {
    return <p className="text-center">Laddar...</p>
  }
  
  const handleSendMemberLink = async () => {
    await toast.promise(sendMemberLink({ id: member.id }), {
      loading: 'Skickar medlemslänk...',
      success: 'Medlemslänk skickad!',
      error: 'Något gick fel, försök igen senare.'
    })
  }

  return (
    <div className="flex flex-col justify-center align-middle">
      <div className="flex flex-row gap-4 justify-center flex-wrap">
        <Card title={member.name} className="w-96">
            <p>{member.activeMembership.type}</p>
              <p>Blev medlem: {formatSwedishTime(member.activeMembership.becameMemberAt, 'yyyy-MM-dd HH:mm')}</p>
            {member.email && (
              <a href={`mailto:${member.email}`} className="underline block">{member.email}</a>
            )}
            {member.phone && (
              <a href={`tel:${member.phone}`} className="underline block">{member.phone}</a>
            )}
            <Button onClick={handleSendMemberLink} disabled={isPending}>
              <MailIcon />
              Skicka medlemslänk
            </Button>
            <Button asChild variant="outline">
              <Link href={`/medlemskort/${member.token}`}>
                  <IdCardIcon />
                  Visa medlemskort
              </Link>
            </Button> 
        </Card>        
      </div>
    </div>
  )
}
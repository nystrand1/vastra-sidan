import { zodResolver } from "@hookform/resolvers/zod";
import { Role } from "@prisma/client";
import { IdCardIcon, MailIcon, SaveIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { type z } from "zod";
import Card from "~/components/atoms/CardLink/CardLink";
import { Button } from "~/components/ui/button";
import { Form, FormField } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { api } from "~/utils/api";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { updateMemberSchema } from "~/utils/zodSchemas";

export default function AdminMemberPage() {
  const { data: sessionData } = useSession();
  const { query } = useRouter();
  const { data: member, refetch } = api.admin.getMemberById.useQuery(
    { id: query.id as string },
    { enabled: !!sessionData?.user && sessionData.user.role === Role.ADMIN && !!query.id }
  );
  const { mutateAsync: sendMemberLink, isPending } = api.admin.sendMemberLink.useMutation();
  const { mutateAsync: updateMember, isPending: isUpdatingMember } = api.admin.updateMember.useMutation();

  const form = useForm<z.infer<typeof updateMemberSchema>>({
    resolver: zodResolver(updateMemberSchema),
    defaultValues: {
      id: member?.id,
      email: member?.email,
      phone: member?.phone
    }
  });

  useEffect(() => {
    form.reset({
      id: member?.id,
      email: member?.email,
      phone: member?.phone
    });
  }, [member]);

  
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

  const handleUpdateMember = async (data: z.infer<typeof updateMemberSchema>) => {
    await toast.promise(updateMember({ id: member.id, email: data.email, phone: data.phone }), {
      loading: 'Uppdaterar...',
      success: 'Uppdaterad!',
      error: 'Något gick fel, försök igen senare.'
    })
    await refetch();
  }

  return (
    <div className="flex flex-col justify-center align-middle">
      <div className="flex flex-row gap-4 justify-center flex-wrap">
        <Card title={member.name} className="w-96">
            <p>{member.activeMembership.type}</p>
              <p>Blev medlem: {formatSwedishTime(member.activeMembership.becameMemberAt, 'yyyy-MM-dd HH:mm')}</p>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleUpdateMember)} className="flex flex-col gap-4">
                {member.email && (
                  <div className="flex flex-row gap-2 items-center">
                    <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <Input {...field} className="w-full" />
                    )}
                    />
                  <Button disabled={!form.formState.isDirty} type="submit" className="w-fit" variant="ghost">
                    <SaveIcon />
                  </Button>
                </div>
              )}
              {member.phone && (
                <div className="flex flex-row gap-2 items-center">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <Input {...field} className="w-full" />
                    )}
                  />
                  <Button disabled={!form.formState.isDirty} type="submit" className="w-fit" variant="ghost">
                    <SaveIcon />
                  </Button>
                </div>
              )}
              </form>
            </Form>
            <Button onClick={handleSendMemberLink} disabled={isPending || isUpdatingMember}>
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
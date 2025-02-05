import { zodResolver } from "@hookform/resolvers/zod";
import { DialogTitle } from "@radix-ui/react-dialog";
import { type inferRouterOutputs } from "@trpc/server";
import { Edit, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import Card from "~/components/atoms/CardLink/CardLink";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "~/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { addFamilyMemberSchema } from "~/utils/zodSchemas";


type FamilyMembers = inferRouterOutputs<AppRouter>['admin']['getMemberById']['familyMembers'];

interface FamilyMembersProps {
  members: FamilyMembers;
  ownerId: string;
}

export const FamilyMembers = ({ members, ownerId }: FamilyMembersProps) => {
  const [open, setOpen] = useState(false);
  const { query } = useRouter();
  const { refetch } = api.admin.getMemberById.useQuery(
    { id: query.id as string },
  );
  const { mutateAsync: addFamilyMember } = api.admin.addFamilyMember.useMutation();

  const form = useForm<z.infer<typeof addFamilyMemberSchema>>({
    resolver: zodResolver(addFamilyMemberSchema),
    defaultValues: {
      member: {
        email: '',
        firstName: '',
        lastName: '',
        phone: ''
      }
    }
  })

  useEffect(() => {
    if (ownerId) {
      form.setValue('ownerId', ownerId);
    }
  }, [ownerId])

  const handleSubmit = form.handleSubmit(async (data) => {
    await toast.promise(addFamilyMember(data), {
      loading: 'Lägger till familjemedlem...',
      success: 'Familjemedlem tillagd!',
      error: 'Något gick fel, skriv till Filip.'
    })
    await refetch();
    setOpen(false);
  });

  return (
    <Card title="Familjemedlemmar" className="w-96 h-fit">
      <ul className="space-y-4 divide-y border-b pb-4">
        {!members?.length && <p>Inga familjemedlemmar</p>}
        {members?.map((familyMember) => (
          <li key={familyMember.id} className="space-y-2 pt-2">
            <div className="flex flex-row items-center justify-between">
              <p>{familyMember.name}</p>
              {familyMember.id === ownerId && <Badge className="text-xs">Ägare</Badge>}
            </div>
            {familyMember.email && <p>{familyMember.email}</p>}
            {familyMember.phone && <p>{familyMember.phone}</p>}
            <div className="flex flex-row items-center justify-between gap-8">
              <Link className="block" href={`/admin/members/${familyMember.id}`}>
                <Button>
                  <Edit />
                  Redigera
                </Button>
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger>
          <Button>
            <UserPlus />
            Lägg till familjemedlem
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-left">Lägg till familjemedlem</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="member.firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Förnamn</FormLabel>
                    <FormControl>
                      <Input placeholder="Förnamn..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="member.lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Efternamn</FormLabel>
                    <FormControl>
                      <Input placeholder="Efternamn..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="member.email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Email..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="member.phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobilnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="Mobil..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={!form.formState.isValid}
              >Lägg till</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
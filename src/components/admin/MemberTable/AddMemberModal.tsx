import { zodResolver } from "@hookform/resolvers/zod";
import { captureException } from "@sentry/nextjs";
import { TRPCClientError } from "@trpc/client";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { type z } from "zod";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select";
import { api } from "~/utils/api";
import { adminAddMemberSchema } from "~/utils/zodSchemas";

type AdditionalMember = NonNullable<
  z.infer<typeof adminAddMemberSchema>["additionalMembers"]
>[number];

const defaultFamilyMember: AdditionalMember = {
  firstName: "",
  lastName: "",
  email: "",
  phone: ""
};

const defaultValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  membershipId: "",
  membershipType: undefined
};

export const AddMemberModal = () => {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();
  const { data: memberships } = api.admin.getAvailableMemberships.useQuery();
  const { mutateAsync: addMember } = api.admin.addMember.useMutation();

  const form = useForm<z.infer<typeof adminAddMemberSchema>>({
    resolver: zodResolver(adminAddMemberSchema),
    defaultValues
  });

  const additionalMembers = useFieldArray({
    control: form.control,
    name: "additionalMembers",
    rules: { maxLength: 4 }
  });

  const membershipId = form.watch("membershipId");
  const selectedMembership = memberships?.find((m) => m.id === membershipId);
  const membershipType = selectedMembership?.type;

  if (membershipType && form.getValues("membershipType") !== membershipType) {
    form.setValue("membershipType", membershipType);
  }
  if (membershipType !== "FAMILY" && form.getValues("additionalMembers") !== undefined) {
    form.setValue("additionalMembers", undefined);
  }

  const handleSubmit = async (values: z.infer<typeof adminAddMemberSchema>) => {
    try {
      await addMember(values);
      await utils.admin.getActiveMembers.invalidate();
      toast.success("Medlem tillagd");
      form.reset(defaultValues);
      setOpen(false);
    } catch (error) {
      if (error instanceof TRPCClientError) {
        if (error.message === "Har redan detta medlemskap") {
          toast.error("Medlemmen har redan detta medlemskap.");
          return;
        }
      }
      captureException(error);
      toast.error("Något gick fel, försök igen!");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaultValues);
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-fit">
          <UserPlusIcon className="w-4 h-4" />
          Lägg till medlem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lägg till medlem</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-2"
          >
            <FormField
              control={form.control}
              name="firstName"
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
              name="lastName"
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
              name="email"
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
              name="phone"
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
            <FormField
              control={form.control}
              name="membershipId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medlemskap</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Välj medlemskap..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {memberships?.map((membership) => (
                        <SelectItem key={membership.id} value={membership.id}>
                          {membership.name} ({membership.type}) —{" "}
                          {membership.price / 100} kr
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {membershipType === "FAMILY" && (
              <div className="space-y-4">
                {additionalMembers.fields.map((member, index) => (
                  <div
                    key={member.id}
                    className="space-y-2 border-t mt-4 pt-2"
                  >
                    <div className="flex flex-row justify-between items-center">
                      <h2 className="text-lg">Familjemedlem {index + 1}</h2>
                      <Button
                        variant="link"
                        className="text-destructive w-fit"
                        type="button"
                        onClick={() => additionalMembers.remove(index)}
                      >
                        Ta bort
                      </Button>
                    </div>
                    <FormField
                      control={form.control}
                      name={`additionalMembers.${index}.firstName`}
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
                      name={`additionalMembers.${index}.lastName`}
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
                      name={`additionalMembers.${index}.email`}
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
                      name={`additionalMembers.${index}.phone`}
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
                  </div>
                ))}
                {additionalMembers.fields.length < 4 && (
                  <Button
                    className="w-full"
                    type="button"
                    onClick={() => additionalMembers.append(defaultFamilyMember)}
                  >
                    Lägg till familjemedlem
                  </Button>
                )}
              </div>
            )}
            <Button
              disabled={form.formState.isSubmitting}
              type="submit"
              className="w-full"
            >
              Lägg till
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

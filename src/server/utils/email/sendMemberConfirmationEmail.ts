import { type Member, type Membership } from "@prisma/client";
import { render } from "@react-email/components";
import MemberSignup from "~/components/emails/MemberSignUp";
import { env } from "~/env.mjs";
import { sendSesEmail } from "./sendSesEmail";

export const sendMemberConfirmationEmail = async (
  member: Member,
  membership: Membership
) => {
  const memberUrl = `${env.MEMBERSHIP_URL}/${member.memberToken}`;
  const formattedMember = {
    name: `${member.firstName} ${member.lastName}`,
    email: member.email,
    phone: member.phone
  };

  return await sendSesEmail({
    to: member.email,
    subject: `Tack för att du blivit medlem i Västra Sidan`,
    body: await render(
      MemberSignup({
        member: formattedMember,
        memberUrl,
        membershipType: membership.type,
        memberImageUrl: membership.imageUrl
      })
    )
  });
};

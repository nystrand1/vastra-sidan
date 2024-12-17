import { type Member, type Membership } from "@prisma/client";
import { render } from "@react-email/components";
import MemberSignup from "~/components/emails/MemberSignUp";
import { env } from "~/env.mjs";
import { resend } from "../../resend";
import { sendSesEmail } from "./sendSesEmail";

export const sendMemberConfirmationEmail = async (
  member: Member,
  membership: Membership
) => {
  const memberUrl = `${env.MEMBERSHIP_URL}/${member.id}`;
  const formattedMember = {
    name: `${member.firstName} ${member.lastName}`,
    email: member.email,
    phone: member.phone,
  }

  if (env.ENABLE_AWS_SES_EMAILS) {
    return await sendSesEmail({
      to: member.email,
      subject: `Tack för att du blivit medlem i Västra Sidan`,
      body: await render(MemberSignup({ 
        member: formattedMember, 
        memberUrl,
        membershipType: membership.type,
        memberImageUrl: membership.imageUrl,
      }))
    })
  }

  return await resend.emails.send({
    from: `Västra Sidan <${env.BOOKING_EMAIL}>`,
    to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : member.email,
    subject: `Tack för att du blivit medlem i Västra Sidan`,
    react: MemberSignup({ 
      member: formattedMember, 
      memberUrl,
      membershipType: membership.type,
      memberImageUrl: membership.imageUrl,
    })
  });
};
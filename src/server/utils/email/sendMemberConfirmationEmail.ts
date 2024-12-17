import { type Membership, type Member } from "@prisma/client";
import MemberSignup from "~/components/emails/MemberSignUp";
import { env } from "~/env.mjs";
import { resend } from "../../resend";
import { ses } from "~/server/ses";
import { render } from "@react-email/components";

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

  if (env.ENABLE_SES_EMAILS) {
    return await ses.sendEmail({
      Source: `Västra Sidan <${env.BOOKING_EMAIL}>`,
      Destination: {
        ToAddresses: [
          env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : member.email
        ],
      },
      Message: {
        Subject: {
          Charset: "UTF-8",
          Data: `Tack för att du blivit medlem i Västra Sidan`,
        },
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: await render(MemberSignup({ 
              member: formattedMember, 
              memberUrl,
              membershipType: membership.type,
              memberImageUrl: membership.imageUrl,
            })),
          },
        },
      }
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
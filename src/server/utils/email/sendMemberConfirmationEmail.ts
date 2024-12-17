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
  console.log("Sending member confirmation email");
  const memberUrl = `${env.MEMBERSHIP_URL}/${member.id}`;
  const formattedMember = {
    name: `${member.firstName} ${member.lastName}`,
    email: member.email,
    phone: member.phone,
  }

  if (env.ENABLE_AWS_SES_EMAILS) {
    console.log("Sending mail using AWS SES");
    const res = await ses.sendEmail({
      Source: `Vastra Sidan <${env.BOOKING_EMAIL}>`,
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
    });
    console.log('res', JSON.stringify(res, null, 2));
    return;
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
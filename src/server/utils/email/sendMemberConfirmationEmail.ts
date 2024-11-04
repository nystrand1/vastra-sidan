import { type Member } from "@prisma/client";
import MemberSignup from "~/components/emails/MemberSignUp";
import { env } from "~/env.mjs";
import { resend } from "../../resend";

export const sendMemberConfirmationEmail = async (
  member: Member
) => {
  const memberUrl = `${env.MEMBERSHIP_URL}/${member.id}`;
  return await resend.emails.send({
    from: env.BOOKING_EMAIL,
    to: env.USE_DEV_MODE === "true" ? "filip.nystrand@gmail.com" : member.email,
    subject: `Tack för att du blivit medlem i Västra Sidan`,
    react: MemberSignup({ member, memberUrl })
  });
};
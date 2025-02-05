import { MembershipType } from "@prisma/client";
import { type z } from "zod";
import { prisma } from "~/server/db";
import { type addFamilyMemberSchema } from "~/utils/zodSchemas";


type AddFamilyMember = z.infer<typeof addFamilyMemberSchema>;



export const addFamilyMember = async ({ ownerId, member } : AddFamilyMember) => {
  const today = new Date();
  const owner = await prisma.member.findUniqueOrThrow({
    include: {
      memberships: true,
      stripePayments: true,
      stripeRefunds: true
    },
    where: {
      id: ownerId,
      memberships: {
        some: {
          endDate: {
            gte: today
          },
          startDate: {
            lte: today
          }
        }
      }
    }
  });

  const [ownerMembership] = owner.memberships;

  if (ownerMembership?.type !== MembershipType.FAMILY) {
    throw new Error('Owner does not have a family membership');
  }

  const [stripePayment] = owner.stripePayments;
  const [stripeRefund] = owner.stripeRefunds;

  if (!stripePayment) {
    throw new Error('Owner does not have a payment');
  }

  const sameEmailAsOwner = member.email === owner.email;

  const [ownerEmail, ownerDomain] = owner.email.split('@');

  const formattedEmail = sameEmailAsOwner ? `${ownerEmail?.includes('+') ? `${ownerEmail}` : `${ownerEmail}+`}${member.firstName.toLowerCase()}@${ownerDomain}` : member.email;


  await prisma.member.upsert({
    where: {
      email: formattedEmail,
    },
    update: {},
    create: {
      ...member,
      email: formattedEmail,
      phone: member.phone || owner.phone,
      familyMemberShipOwnerId: owner.id,      
      ...stripePayment && {
        stripePayments: {
          connect: owner.stripePayments.map(payment => ({ id: payment.id }))
        },
      },
      ...stripeRefund && {
        stripeRefunds: {
          connect: owner.stripeRefunds.map(refund => ({ id: refund.id }))
        },
      },
      memberships: {
        connect: {
          id: ownerMembership.id
        }
      }
    }
  })
}
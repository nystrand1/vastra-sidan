import { MembershipType } from "~/generated/prisma/client";
import { TRPCError } from "@trpc/server";
import { type z } from "zod";
import { prisma } from "~/server/db";
import { MAX_FAMILY_MEMBERS } from "~/utils/constants";
import { type addFamilyMemberSchema } from "~/utils/zodSchemas";


type AddFamilyMember = z.infer<typeof addFamilyMemberSchema>;



export const addFamilyMember = async ({ ownerId, member } : AddFamilyMember) => {
  const today = new Date();
  const owner = await prisma.member.findUniqueOrThrow({
    include: {
      // The owner can have memberships from earlier seasons, only the active family one counts
      memberships: {
        where: {
          type: MembershipType.FAMILY,
          endDate: {
            gte: today
          },
          startDate: {
            lte: today
          }
        }
      },
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

  const familyMemberCount = await prisma.member.count({
    where: {
      familyMemberShipOwnerId: owner.id,
      memberships: {
        some: {
          id: ownerMembership.id
        }
      }
    }
  });

  if (familyMemberCount >= MAX_FAMILY_MEMBERS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Familjen har redan ${MAX_FAMILY_MEMBERS} familjemedlemmar`
    });
  }

  const [stripePayment] = owner.stripePayments;
  const [stripeRefund] = owner.stripeRefunds;

  if (!stripePayment) {
    throw new Error('Owner does not have a payment');
  }

  const sameEmailAsOwner = member.email.toLowerCase() === owner.email.toLowerCase();

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
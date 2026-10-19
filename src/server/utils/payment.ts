import {
  StripeRefundStatus,
  type PrismaClient
} from "@prisma/client";
import { participantRefundState } from "./refunds";

/**
 * Where the refund of one participant's cancellation stands. In a group booking each
 * traveller has their own refund, so this looks only at theirs, not the whole payment's.
 */
export const checkRefundStatus = async (
  cancellationToken: string,
  prisma: PrismaClient
) => {
  const participant = await prisma.participant.findFirst({
    where: {
      cancellationToken
    },
    select: {
      stripeRefunds: {
        select: {
          stripeRefundId: true,
          status: true
        }
      }
    }
  });
  const state = participantRefundState(participant?.stripeRefunds ?? []);
  if (state.refunded) {
    return { status: StripeRefundStatus.REFUNDED };
  }
  if (state.pending) {
    return { status: StripeRefundStatus.CREATED };
  }
  if (state.failedAttempts > 0) {
    return { status: StripeRefundStatus.ERROR };
  }
  return { status: "Not found" };
};

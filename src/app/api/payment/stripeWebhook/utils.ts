import { StripePaymentStatus, StripeRefundStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "~/server/db";
import { stripe } from "~/server/stripe";

export const handleSuccessfulPayment = async (paymentIntent: Stripe.PaymentIntentSucceededEvent) => {
  const originalPayment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: paymentIntent.data.object.id
    },
    include: {
      participants: true,
      members: true,
    }
  });
  if (!originalPayment) {
    throw new Error("Payment not found");
  }
  return await prisma.stripePayment.create({
    data: {
      amount: paymentIntent.data.object.amount,
      netAmount: paymentIntent.data.object.amount,
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.SUCCEEDED,
      participants: {
        connect: originalPayment.participants.map(p => ({ id: p.id }))
      },
      members: {
        connect: originalPayment.members.map(m => ({ id: m.id }))
      },
    },
    include: {
      participants: {
        include: {
          event: true,
          bus: true
        }
      },
      members: true
    }
  });
}

export const handleFailedPayment = async (paymentIntent: Stripe.PaymentIntentPaymentFailedEvent) => {
  await prisma.stripePayment.create({
    data: {
      amount: paymentIntent.data.object.amount,
      stripePaymentId: paymentIntent.data.object.id,
      status: StripePaymentStatus.CANCELED,
    }
  });
};

export const handleChargeUpdate = async (charge: Stripe.ChargeUpdatedEvent) => {
  const paymentIntentId = charge.data.object.payment_intent;
  const transactionId = charge.data.object.balance_transaction;
  if (!paymentIntentId) {
    throw new Error("Payment intent not found");
  }
  const payment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: typeof paymentIntentId === 'string' ? paymentIntentId : paymentIntentId.id,
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (!payment || !transactionId) {
    throw new Error("Payment not found");
  }

  const strapiFee = await stripe.balanceTransactions.retrieve(typeof transactionId === 'string' ? transactionId : transactionId.id);

  if (strapiFee.fee) {
    await prisma.stripePayment.update({
      where: {
        id: payment.id
      },
      data: {
        netAmount: strapiFee.net,
        amount: strapiFee.amount,
      }
    });
  }
}


export const handleRefund = async (refund: Stripe.ChargeRefundedEvent) => {
  const refundId = refund.data.object.id;
  const paymentIntentId = refund.data.object.payment_intent;
  const status = refund.data.object.status;
  if (!paymentIntentId) {
    throw new Error("Payment intent not found");
  }
  const payment = await prisma.stripePayment.findFirst({
    where: {
      stripePaymentId: typeof paymentIntentId === 'string' ? paymentIntentId : paymentIntentId.id,
      status: StripePaymentStatus.SUCCEEDED
    }
  });
  if (!payment) {
    throw new Error("Payment not found");
  }
  const refundIntent = await prisma.stripeRefund.findFirst({
    where: {
      originalPaymentId: payment.id,
      status: StripeRefundStatus.CREATED,
      participant: {
        stripeRefunds: {
          none: {
            status: StripeRefundStatus.REFUNDED
          }
        }
      }
    }
  });

  if (!refundIntent) {
    // Manual refund from Stripe dashboard
    if (status === 'succeeded') {
      const dbRefund = await prisma.stripeRefund.create({
        data: {
          status: StripeRefundStatus.REFUNDED,
          amount: refund.data.object.amount,
          stripeRefundId: refundId,
          originalPaymentId: payment.id,        
        },
      });
      const membershipId = refund.data.object.metadata.membershipId;
      if (membershipId) {
        const membersRelatedToRefund = await prisma.member.findMany({
          where: {
            stripePayments: {
              some: {
                id: payment.id,
                status: StripePaymentStatus.SUCCEEDED
              },            
            },
          }
        });

        // Attach a refund to the members
        const refundPromise = prisma.stripeRefund.update({
          where: {
            id: dbRefund.id
          },
          data: {
            members: {
              connect: membersRelatedToRefund.map(m => ({ id: m.id }))
            }
          }
        });

        // Remove the membership from the members
        const disconnectPromise = prisma.membership.update({
          where: {
            id: membershipId
          },
          data: {
            members: {
              disconnect: membersRelatedToRefund.map(m => ({ id: m.id }))
            },            
          }
        });

        await Promise.all([refundPromise, disconnectPromise]);
      }
    }
    if (status === 'failed') {
      await prisma.stripeRefund.create({
        data: {
          status: StripeRefundStatus.ERROR,
          amount: refund.data.object.amount_refunded,
          stripeRefundId: refundId,
          errorMessage: refund.data.object.failure_message,
          errorCode: refund.data.object.failure_code,
          originalPaymentId: payment.id,
        }
      });
    }
    return;
  }
  
  if (!refundIntent.participantId) {
    throw new Error("Participant not found");
  }

  if (status === 'succeeded') {
    await prisma.stripeRefund.create({
      data: {
        status: StripeRefundStatus.REFUNDED,
        amount: refund.data.object.amount,
        stripeRefundId: refundId,
        originalPaymentId: payment.id,
        participantId: refundIntent.participantId,
      }
    });
    await prisma.participant.update({
      where: {
        id: refundIntent.participantId
      },
      data: {
        cancellationDate: new Date()
      }
    });
  }

  if (status === 'failed') {
    await prisma.stripeRefund.create({
      data: {
        status: StripeRefundStatus.ERROR,
        amount: refund.data.object.amount_refunded,
        stripeRefundId: refundId,
        errorMessage: refund.data.object.failure_message,
        errorCode: refund.data.object.failure_code,
        originalPaymentId: payment.id,
        participantId: refundIntent.participantId,
      }
    });
  }

}
import { StripePaymentStatus, StripeRefundStatus } from "~/generated/prisma/client";
import { captureException, captureMessage } from "@sentry/nextjs";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createEvent, createSeason, familyMember, memberSignupInput, participantInput } from "../helpers/factories";
import { bookAndPay, signUpAndPay } from "../helpers/flows";
import { getSentEmails } from "../mocks/ses";
import { server } from "../mocks/server";
import { fakeStripe, postToWebhook } from "../mocks/stripe";


/** SES rejects the next email (a non-retryable error, so the SDK doesn't retry it). */
const rejectNextEmail = () =>
  server.use(
    http.post(
      "https://email.eu-north-1.amazonaws.com/",
      () =>
        new HttpResponse(
          `<ErrorResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/">
  <Error><Type>Sender</Type><Code>MessageRejected</Code><Message>Email address is not verified.</Message></Error>
  <RequestId>test-request-id</RequestId>
</ErrorResponse>`,
          { status: 400, headers: { "content-type": "text/xml" } }
        ),
      { once: true }
    )
  );

const startBooking = async () => {
  const event = await createEvent();
  const clientSecret = await publicCaller().eventPayment.requestStripePayment({
    eventId: event.id,
    participants: [participantInput(event.buses[0]!.id)]
  });
  return fakeStripe.paymentIntentByClientSecret(clientSecret);
};

describe("Stripe webhook", () => {
  describe("signature verification", () => {
    it("rejects a request without a signature", async () => {
      const paymentIntent = await startBooking();
      const payload = JSON.stringify({ type: "payment_intent.succeeded", data: { object: paymentIntent } });

      const res = await postToWebhook(payload, null);

      expect(res.status).toBe(400);
      expect(await prisma.stripePayment.count({ where: { status: StripePaymentStatus.SUCCEEDED } })).toBe(0);
    });

    it("rejects a request with an invalid signature", async () => {
      const paymentIntent = await startBooking();
      const payload = JSON.stringify({ type: "payment_intent.succeeded", data: { object: paymentIntent } });

      const res = await postToWebhook(payload, "t=1,v1=forged");

      expect(res.status).toBe(400);
      expect(await prisma.stripePayment.count({ where: { status: StripePaymentStatus.SUCCEEDED } })).toBe(0);
    });
  });

  describe("payment_intent.succeeded", () => {
    it("fails for a payment intent we never created, so Stripe retries it", async () => {
      const paymentIntent = await startBooking();
      await prisma.stripePayment.deleteMany();

      const res = await fakeStripe.succeedPayment(paymentIntent.id);

      expect(res.status).toBe(400);
    });

    // Stripe delivers at-least-once, so the handler must be idempotent.
    it("ignores a redelivered event", async () => {
      const event = await createEvent();
      const { paymentIntent } = await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);
      const [succeededEvent] = fakeStripe.events();

      const res = await fakeStripe.redeliver(succeededEvent!.id);

      expect(res.status).toBe(201);
      expect(
        await prisma.stripePayment.count({
          where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
        })
      ).toBe(1);
      expect(getSentEmails()).toHaveLength(1);
    });

    it("processes deliveries that arrive at the same time only once", async () => {
      const paymentIntent = await startBooking();

      const first = fakeStripe.succeedPayment(paymentIntent.id);
      const [succeededEvent] = fakeStripe.events();
      const responses = await Promise.all([first, fakeStripe.redeliver(succeededEvent!.id)]);

      expect(responses.map((r) => r.status)).toEqual([201, 201]);
      expect(
        await prisma.stripePayment.count({
          where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
        })
      ).toBe(1);
      expect(getSentEmails()).toHaveLength(1);
    });

    it("still gives members their membership when a confirmation email fails", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family, { additionalMembers: [familyMember()] });
      rejectNextEmail();

      // signUpAndPay asserts the webhook succeeded, so Stripe won't retry it
      const paymentIntent = await signUpAndPay(input);

      const members = await prisma.member.findMany({ include: { memberships: true } });
      expect(members).toHaveLength(2);
      for (const member of members) {
        expect(member.memberships).toEqual([expect.objectContaining({ id: family.id })]);
      }
      expect(getSentEmails()).toHaveLength(1);
      expect(captureException).toHaveBeenCalledTimes(1);

      const [succeededEvent] = fakeStripe.events();
      await fakeStripe.redeliver(succeededEvent!.id);
      expect(
        await prisma.stripePayment.count({
          where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
        })
      ).toBe(1);
    });

    it("saves the booking even if the confirmation email fails", async () => {
      const paymentIntent = await startBooking();
      rejectNextEmail();

      const res = await fakeStripe.succeedPayment(paymentIntent.id);

      expect(res.status).toBe(201);
      expect(
        await prisma.stripePayment.count({
          where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
        })
      ).toBe(1);
      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe("payment_intent.payment_failed", () => {
    it("records the failed payment", async () => {
      const paymentIntent = await startBooking();

      const res = await fakeStripe.failPayment(paymentIntent.id);

      expect(res.status).toBe(201);
      expect(
        await prisma.stripePayment.findMany({ where: { stripePaymentId: paymentIntent.id } })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: StripePaymentStatus.CREATED }),
          expect.objectContaining({ status: StripePaymentStatus.CANCELED, amount: 40000 })
        ])
      );
      expect(getSentEmails()).toHaveLength(0);
    });
  });

  describe("charge.updated", () => {
    it("stores the net amount after Stripe's fee", async () => {
      const event = await createEvent();
      const { paymentIntent } = await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);

      const res = await fakeStripe.settleCharge(paymentIntent.id, { fee: 1250 });

      expect(res.status).toBe(201);
      expect(
        await prisma.stripePayment.findFirst({
          where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
        })
      ).toMatchObject({ amount: 40000, netAmount: 38750 });
      expect(fakeStripe.requests().filter((r) => r.path.startsWith("/v1/balance_transactions/"))).toHaveLength(1);
    });
  });

  describe("charge.refunded", () => {
    it("revokes a family membership refunded from the Stripe dashboard", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family, { additionalMembers: [familyMember()] });
      const paymentIntent = await signUpAndPay(input);

      const res = await fakeStripe.refundFromDashboard(paymentIntent.id);

      expect(res.status).toBe(201);
      const members = await prisma.member.findMany({ include: { memberships: true, stripeRefunds: true } });
      expect(members).toHaveLength(2);
      for (const member of members) {
        expect(member.memberships).toHaveLength(0);
        expect(member.stripeRefunds).toEqual([
          expect.objectContaining({ status: StripeRefundStatus.REFUNDED })
        ]);
      }
    });

    it("records a dashboard refund once, even if the event is redelivered", async () => {
      const event = await createEvent();
      const { paymentIntent } = await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);
      await fakeStripe.refundFromDashboard(paymentIntent.id, 10000);
      const chargeRefunded = fakeStripe.events().find((e) => e.type === "charge.refunded");

      const res = await fakeStripe.redeliver(chargeRefunded!.id);

      expect(res.status).toBe(201);
      const [refund] = fakeStripe.refunds();
      expect(await prisma.stripeRefund.findMany()).toEqual([
        expect.objectContaining({
          stripeRefundId: refund!.id,
          amount: 10000,
          status: StripeRefundStatus.REFUNDED
        })
      ]);
    });

    it("reports a dashboard refund it can't record because older rows overstate the refunded amount", async () => {
      const event = await createEvent();
      const busId = event.buses[0]!.id;
      const { paymentIntent, participants } = await bookAndPay(event.id, [
        participantInput(busId),
        participantInput(busId)
      ]);
      const payment = await prisma.stripePayment.findFirstOrThrow({
        where: { stripePaymentId: paymentIntent.id, status: StripePaymentStatus.SUCCEEDED }
      });
      // How the old handler recorded a refund: the charge id and the full charge amount
      const chargeId = fakeStripe.paymentIntents()[0]!.latest_charge!;
      await prisma.stripeRefund.create({
        data: {
          stripeRefundId: chargeId,
          amount: 80000,
          status: StripeRefundStatus.REFUNDED,
          participantId: participants[0]!.id,
          originalPaymentId: payment.id
        }
      });

      const res = await fakeStripe.refundFromDashboard(paymentIntent.id, 10000);

      expect(res.status).toBe(201);
      const [refund] = fakeStripe.refunds();
      expect(await prisma.stripeRefund.count()).toBe(1);
      expect(captureMessage).toHaveBeenCalledWith(
        `Skipped recording Stripe refund ${refund!.id}: already counted as refunded`,
        expect.objectContaining({ level: "warning" })
      );
    });

    // `charge.refunded` carries a Charge, so the handler has to look up the Refund itself.
    it("stores Stripe's refund id and the refunded amount", async () => {
      const event = await createEvent();
      const busId = event.buses[0]!.id;
      const { participants } = await bookAndPay(event.id, [participantInput(busId), participantInput(busId)]);
      await publicCaller().eventPayment.cancelBooking({ token: participants[0]!.cancellationToken! });
      const [refund] = fakeStripe.refunds();

      await fakeStripe.completeRefund(refund!.id);

      expect(
        await prisma.stripeRefund.findFirst({ where: { status: StripeRefundStatus.REFUNDED } })
      ).toMatchObject({ stripeRefundId: refund!.id, amount: refund!.amount });
    });
  });
});

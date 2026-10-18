import { expect } from "vitest";
import { type z } from "zod";
import { type memberSignupSchema, type participantSchema } from "~/utils/zodSchemas";
import { fakeStripe } from "../mocks/stripe";
import { publicCaller } from "./caller";
import { prisma } from "./db";

/** Public membership signup, then the customer pays and Stripe confirms via webhook. */
export const signUpAndPay = async (input: z.infer<typeof memberSignupSchema>) => {
  const { clientId } = await publicCaller().memberPayment.requestPayment(input);
  const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientId);
  const res = await fakeStripe.succeedPayment(paymentIntent.id);
  expect(res.status).toBe(201);
  return paymentIntent;
};

/** Public event booking, then the customer pays and Stripe confirms via webhook. */
export const bookAndPay = async (
  eventId: string,
  participants: z.infer<typeof participantSchema>[]
) => {
  const clientSecret = await publicCaller().eventPayment.requestStripePayment({
    eventId,
    participants
  });
  const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientSecret);
  const res = await fakeStripe.succeedPayment(paymentIntent.id);
  expect(res.status).toBe(201);
  const booked = await prisma.participant.findMany({
    where: { stripePayments: { some: { stripePaymentId: paymentIntent.id } } },
    orderBy: { createdAt: "asc" }
  });
  return { paymentIntent, participants: booked };
};

/** Seats left on a bus, as shown to visitors on the public event page. */
export const availableSeats = async (eventId: string, busId: string) => {
  const event = await publicCaller().public.getAwayGame({ id: eventId });
  const bus = event?.buses.find((b) => b.id === busId);
  if (!bus) throw new Error(`Bus ${busId} not found on event ${eventId}`);
  return bus.availableSeats;
};

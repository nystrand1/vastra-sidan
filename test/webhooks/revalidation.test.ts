import { captureException } from "@sentry/nextjs";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { adminCaller, cronCaller, publicCaller } from "../helpers/caller";
import { createEvent, createSeason, memberSignupInput, participantInput } from "../helpers/factories";
import { book, bookAndPay, expireSeatHolds, signUpAndPay } from "../helpers/flows";
import { getRevalidatedPaths, resetRevalidatedPaths } from "../mocks/revalidate";
import { server } from "../mocks/server";
import { fakeStripe } from "../mocks/stripe";

// The trip pages are cached for an hour, so whatever changes their free seats
// must regenerate them.
const tripPages = (eventId: string) => ["/", "/bortaresor", `/bortaresor/${eventId}`];

describe("regenerating cached pages", () => {
  it("regenerates the trip's pages when a booking is paid", async () => {
    const event = await createEvent();

    await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);

    expect(getRevalidatedPaths()).toEqual(tripPages(event.id));
  });

  it("regenerates the trip's pages when a cancelled traveller is refunded", async () => {
    const event = await createEvent();
    const { participants } = await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);
    await publicCaller().eventPayment.cancelBooking({ token: participants[0]!.cancellationToken! });
    resetRevalidatedPaths();

    const res = await fakeStripe.completeRefund(fakeStripe.refunds()[0]!.id);

    expect(res.status).toBe(201);
    expect(new Set(getRevalidatedPaths())).toEqual(new Set(tripPages(event.id)));
  });

  it("regenerates the start page, which shows the member count, when a membership is paid", async () => {
    const { regular } = await createSeason();

    await signUpAndPay(memberSignupInput(regular));

    expect(getRevalidatedPaths()).toEqual(["/"]);
  });

  it("regenerates the trip's pages when an admin moves a traveller to another bus", async () => {
    const event = await createEvent({
      buses: [
        { name: "Buss 1", seats: 10 },
        { name: "Buss 2", seats: 10 }
      ]
    });
    const { participants } = await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);
    resetRevalidatedPaths();

    await adminCaller().admin.changeBus({ participantId: participants[0]!.id, busId: event.buses[1]!.id });

    expect(getRevalidatedPaths()).toEqual(tripPages(event.id));
  });

  it("regenerates the trip's pages when cron gives back the seats of unpaid bookings", async () => {
    const event = await createEvent();
    await book(event.id, [participantInput(event.buses[0]!.id)]);
    await expireSeatHolds();

    await expect(cronCaller().cron.releaseExpiredSeatHolds()).resolves.toEqual({ released: 1 });

    expect(getRevalidatedPaths()).toEqual(tripPages(event.id));
  });

  it("still confirms the payment when the pages can't be regenerated", async () => {
    server.use(
      http.post("http://localhost:3000/api/revalidate", () => new HttpResponse(null, { status: 500 }), {
        once: true
      })
    );
    const event = await createEvent();

    await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

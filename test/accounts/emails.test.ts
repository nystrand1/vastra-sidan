import { afterEach, describe, expect, it } from "vitest";
import { featureFlags } from "~/utils/featureFlags";
import { createEvent, createSeason, memberSignupInput, participantInput } from "../helpers/factories";
import { bookAndPay, signUpAndPay } from "../helpers/flows";
import { getSentEmails } from "../mocks/ses";

const loginLink = `${process.env.WEBSITE_URL}/loggain`;
const tripCopy = "Logga in på vastrasidan.se för att se alla dina resor";
const membershipCopy = "Logga in på vastrasidan.se för att se alla dina medlemskap";

const bookingEmail = async () => {
  const event = await createEvent();
  await bookAndPay(event.id, [participantInput(event.buses[0]!.id)]);
  return getSentEmails().at(-1)!.html!;
};

const membershipEmail = async () => {
  const { regular } = await createSeason();
  await signUpAndPay(memberSignupInput(regular));
  return getSentEmails().at(-1)!.html!;
};

describe("account links in confirmation emails", () => {
  const loginWasOn = featureFlags.ENABLE_LOGIN;
  afterEach(() => {
    featureFlags.ENABLE_LOGIN = loginWasOn;
  });

  it("links to the account from the booking confirmation when login is on", async () => {
    featureFlags.ENABLE_LOGIN = true;
    const html = await bookingEmail();
    expect(html).toContain(tripCopy);
    expect(html).toContain(loginLink);
  });

  it("leaves the account link out of the booking confirmation when login is off", async () => {
    featureFlags.ENABLE_LOGIN = false;
    const html = await bookingEmail();
    expect(html).not.toContain(tripCopy);
    expect(html).not.toContain(loginLink);
  });

  it("links to the account from the membership confirmation when login is on", async () => {
    featureFlags.ENABLE_LOGIN = true;
    const html = await membershipEmail();
    expect(html).toContain(membershipCopy);
    expect(html).toContain(loginLink);
  });

  it("leaves the account link out of the membership confirmation when login is off", async () => {
    featureFlags.ENABLE_LOGIN = false;
    const html = await membershipEmail();
    expect(html).not.toContain(membershipCopy);
    expect(html).not.toContain(loginLink);
  });
});

import { MembershipType, StripePaymentStatus } from "@prisma/client";
import { addMonths } from "date-fns";
import { describe, expect, it } from "vitest";
import { publicCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import {
  createExpiredSeason,
  createSeason,
  endSeason,
  familyMember,
  memberSignupInput
} from "../helpers/factories";
import { signUpAndPay } from "../helpers/flows";
import { getSentEmails } from "../mocks/ses";
import { fakeStripe } from "../mocks/stripe";

const findMember = (email: string) =>
  prisma.member.findUnique({
    where: { email },
    include: { memberships: true, stripePayments: true, familyMembers: true }
  });

describe("public membership signup", () => {
  describe("regular membership", () => {
    it("creates the member and a pending payment, but no membership until Stripe confirms", async () => {
      const { regular } = await createSeason();
      const input = memberSignupInput(regular, { email: "Anna@Test.se" });

      const { clientId } = await publicCaller().memberPayment.requestPayment(input);

      const paymentIntent = fakeStripe.paymentIntentByClientSecret(clientId);
      expect(paymentIntent).toMatchObject({
        amount: 25000,
        currency: "sek",
        metadata: { type: "MEMBERSHIP", membershipId: regular.id }
      });
      expect(fakeStripe.customers()).toEqual([
        expect.objectContaining({ email: "anna@test.se", name: "Anna Svensson" })
      ]);

      const member = await findMember(input.email);
      expect(member).toMatchObject({ firstName: "Anna", lastName: "Svensson", memberships: [] });
      expect(paymentIntent.metadata.membershipOwnerId).toBe(member?.id);
      expect(member?.stripePayments).toEqual([
        expect.objectContaining({
          stripePaymentId: paymentIntent.id,
          amount: 25000,
          status: StripePaymentStatus.CREATED
        })
      ]);
      expect(getSentEmails()).toHaveLength(0);
    });

    it("activates the membership and emails the member when the payment succeeds", async () => {
      const { regular } = await createSeason();
      const input = memberSignupInput(regular);

      const paymentIntent = await signUpAndPay(input);

      const member = await findMember(input.email);
      expect(member?.memberships.map((m) => m.id)).toEqual([regular.id]);
      expect(member?.stripePayments.map((p) => p.status).sort()).toEqual([
        StripePaymentStatus.CREATED,
        StripePaymentStatus.SUCCEEDED
      ]);
      expect(getSentEmails().map((e) => e.to)).toEqual([input.email]);

      // The "thank you" page polls for the payment and links to the member card
      const { id: memberToken } = await publicCaller().memberPayment.checkPaymentStatus({
        paymentId: paymentIntent.id
      });
      expect(memberToken).toBe(member?.memberToken);
      const card = await publicCaller().member.getMember({ memberToken });
      expect(card?.activeMemberships).toEqual([
        expect.objectContaining({ id: regular.id, type: "Ordinarie medlemskap" })
      ]);
    });

    it("lets last season's member renew without creating a duplicate member", async () => {
      const lastSeason = await createSeason();
      const input = memberSignupInput(lastSeason.regular, { email: "anna@test.se" });
      await signUpAndPay(input);
      await endSeason(lastSeason);
      const thisSeason = await createSeason();

      await signUpAndPay({ ...input, membershipId: thisSeason.regular.id });

      expect(await prisma.member.count()).toBe(1);
      const member = await findMember("anna@test.se");
      expect(member?.memberships.map((m) => m.id).sort()).toEqual(
        [lastSeason.regular.id, thisSeason.regular.id].sort()
      );
    });

    it("treats emails case-insensitively, like production MariaDB", async () => {
      const lastSeason = await createSeason();
      await signUpAndPay(memberSignupInput(lastSeason.regular, { email: "anna@test.se" }));
      await endSeason(lastSeason);
      const thisSeason = await createSeason();

      await signUpAndPay(memberSignupInput(thisSeason.regular, { email: "ANNA@test.se" }));

      expect(await prisma.member.count()).toBe(1);
    });

    it("rejects a membership that isn't on sale", async () => {
      const lastSeason = await createExpiredSeason();
      const nextSeason = await createSeason({
        startDate: addMonths(new Date(), 1),
        endDate: addMonths(new Date(), 13)
      });

      for (const membership of [lastSeason.regular, nextSeason.regular]) {
        await expect(
          publicCaller().memberPayment.requestPayment(memberSignupInput(membership))
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "Medlemskapet går inte att köpa just nu"
        });
      }
      expect(await prisma.member.count()).toBe(0);
      expect(fakeStripe.paymentIntents()).toHaveLength(0);
    });

    it("rejects a member who already has any membership this season", async () => {
      const { regular, youth } = await createSeason();
      const input = memberSignupInput(youth);
      await signUpAndPay(input);

      await expect(
        publicCaller().memberPayment.requestPayment({
          ...input,
          membershipId: regular.id,
          membershipType: MembershipType.REGULAR
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Du har redan detta medlemskap" });
      expect(fakeStripe.paymentIntents()).toHaveLength(1);
    });

    it("rejects an unknown membership", async () => {
      const { regular } = await createSeason();

      await expect(
        publicCaller().memberPayment.requestPayment(
          memberSignupInput(regular, { membershipId: "does-not-exist" })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Felaktigt medlemskap" });
      expect(fakeStripe.requests()).toHaveLength(0);
    });

    it("requires accepting the terms", async () => {
      const { regular } = await createSeason();

      await expect(
        publicCaller().memberPayment.requestPayment({
          ...memberSignupInput(regular),
          acceptedTerms: false
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await prisma.member.count()).toBe(0);
    });
  });

  describe("family membership", () => {
    it("links every family member to the owner and activates them all with one payment", async () => {
      const { family } = await createSeason();
      const kids = [familyMember(), familyMember({ phone: "0731111111" })];
      const input = memberSignupInput(family, { additionalMembers: kids });

      const paymentIntent = await signUpAndPay(input);

      expect(paymentIntent.amount).toBe(40000);
      const owner = await findMember(input.email);
      expect(owner).toMatchObject({ familyMemberShipOwnerId: null });
      expect(owner?.memberships.map((m) => m.id)).toEqual([family.id]);
      expect(owner?.familyMembers.map((m) => m.email).sort()).toEqual(
        kids.map((k) => k.email).sort()
      );

      const [firstKid, secondKid] = await Promise.all(kids.map((k) => findMember(k.email)));
      for (const kid of [firstKid, secondKid]) {
        expect(kid?.familyMemberShipOwnerId).toBe(owner?.id);
        expect(kid?.memberships.map((m) => m.id)).toEqual([family.id]);
      }
      // Family members without a phone number inherit the owner's
      expect(firstKid?.phone).toBe(input.phone);
      expect(secondKid?.phone).toBe("0731111111");

      // One payment shared by the whole family
      const payments = await prisma.stripePayment.findMany({
        where: { stripePaymentId: paymentIntent.id },
        include: { members: true }
      });
      expect(payments).toHaveLength(2);
      for (const payment of payments) {
        expect(payment.members).toHaveLength(3);
      }

      expect(getSentEmails().map((e) => e.to).sort()).toEqual(
        [input.email, ...kids.map((k) => k.email)].sort()
      );

      // The thank-you page links to the owner's card
      const { id } = await publicCaller().memberPayment.checkPaymentStatus({
        paymentId: paymentIntent.id
      });
      expect(id).toBe(owner?.memberToken);
    });

    it("accepts the owner plus four family members", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family, {
        additionalMembers: [familyMember(), familyMember(), familyMember(), familyMember()]
      });

      await signUpAndPay(input);

      const owner = await findMember(input.email);
      expect(owner?.familyMembers).toHaveLength(4);
    });

    it("requires at least one family member", async () => {
      const { family } = await createSeason();

      await expect(
        publicCaller().memberPayment.requestPayment(
          memberSignupInput(family, { additionalMembers: [] })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await prisma.member.count()).toBe(0);
    });

    it("requires every family member to have a unique email", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family);

      await expect(
        publicCaller().memberPayment.requestPayment({
          ...input,
          additionalMembers: [familyMember({ email: input.email })]
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await prisma.member.count()).toBe(0);
    });

    it("rejects someone who is already in another family this season", async () => {
      const { family } = await createSeason();
      const kid = familyMember();
      await signUpAndPay(memberSignupInput(family, { additionalMembers: [kid] }));

      await expect(
        publicCaller().memberPayment.requestPayment(
          memberSignupInput(family, { additionalMembers: [kid] })
        )
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Du har redan detta medlemskap" });
    });

    it("rejects more than four family members", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family, {
        additionalMembers: [familyMember(), familyMember(), familyMember(), familyMember(), familyMember()]
      });

      await expect(publicCaller().memberPayment.requestPayment(input)).rejects.toMatchObject({
        code: "BAD_REQUEST"
      });
    });

    it("enforces family rules even if the client sends the wrong membershipType", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family, {
        membershipType: MembershipType.REGULAR,
        additionalMembers: undefined
      });

      await expect(publicCaller().memberPayment.requestPayment(input)).rejects.toMatchObject({
        code: "BAD_REQUEST"
      });
    });

    it("rejects family emails that only differ in case", async () => {
      const { family } = await createSeason();
      const input = memberSignupInput(family, {
        email: "case@test.se",
        additionalMembers: [familyMember({ email: "Case@test.se" })]
      });

      await expect(publicCaller().memberPayment.requestPayment(input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Alla emailadresser måste vara unika")
      });
      expect(await prisma.member.count()).toBe(0);
    });

    it("leaves existing family links alone until the new family is paid for", async () => {
      const lastSeason = await createSeason();
      const kid = familyMember();
      const oldOwnerInput = memberSignupInput(lastSeason.family, { additionalMembers: [kid] });
      await signUpAndPay(oldOwnerInput);
      await endSeason(lastSeason);
      const thisSeason = await createSeason();
      const oldOwner = await findMember(oldOwnerInput.email);

      // Someone names both last season's owner and their kid, but never pays
      await publicCaller().memberPayment.requestPayment(
        memberSignupInput(thisSeason.family, {
          additionalMembers: [kid, familyMember({ email: oldOwnerInput.email })]
        })
      );

      expect((await findMember(oldOwnerInput.email))?.familyMemberShipOwnerId).toBeNull();
      expect((await findMember(kid.email))?.familyMemberShipOwnerId).toBe(oldOwner?.id);
    });

    it("moves a member from last season's family to the new family", async () => {
      const lastSeason = await createSeason();
      const kid = familyMember();
      await signUpAndPay(memberSignupInput(lastSeason.family, { additionalMembers: [kid] }));
      await endSeason(lastSeason);
      const thisSeason = await createSeason();

      const newOwnerInput = memberSignupInput(thisSeason.family, { additionalMembers: [kid] });
      await signUpAndPay(newOwnerInput);

      const newOwner = await findMember(newOwnerInput.email);
      const member = await findMember(kid.email);
      expect(member?.familyMemberShipOwnerId).toBe(newOwner?.id);
    });
  });
});

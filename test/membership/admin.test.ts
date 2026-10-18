import { MembershipType, StripePaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import {
  adminAddMemberInput,
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

describe("admin: add member", () => {
  it("is only available to admins", async () => {
    const { regular } = await createSeason();
    const input = adminAddMemberInput(regular);

    await expect(publicCaller().admin.addMember(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(userCaller().admin.addMember(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await prisma.member.count()).toBe(0);
  });

  it("only offers memberships for the current season", async () => {
    await createExpiredSeason();
    const { family, regular, youth } = await createSeason();

    const memberships = await adminCaller().admin.getAvailableMemberships();

    expect(memberships.map((m) => m.id).sort()).toEqual([family.id, regular.id, youth.id].sort());
  });

  it("activates a membership straight away with a free payment, without Stripe", async () => {
    const { regular } = await createSeason();
    const input = adminAddMemberInput(regular);

    await adminCaller().admin.addMember(input);

    const member = await findMember(input.email);
    expect(member?.memberships.map((m) => m.id)).toEqual([regular.id]);
    expect(member?.stripePayments).toEqual([
      expect.objectContaining({
        stripePaymentId: `admin-comp-${member?.id}`,
        amount: 0,
        status: StripePaymentStatus.SUCCEEDED
      })
    ]);
    expect(fakeStripe.requests()).toHaveLength(0);
    expect(getSentEmails().map((e) => e.to)).toEqual([input.email]);
  });

  it("adds a whole family linked to the owner", async () => {
    const { family } = await createSeason();
    const kids = [familyMember(), familyMember()];
    const input = adminAddMemberInput(family, { additionalMembers: kids });

    await adminCaller().admin.addMember(input);

    const owner = await findMember(input.email);
    expect(owner?.memberships.map((m) => m.id)).toEqual([family.id]);
    expect(owner?.familyMembers.map((m) => m.email).sort()).toEqual(kids.map((k) => k.email).sort());
    for (const kid of kids) {
      const member = await findMember(kid.email);
      expect(member?.familyMemberShipOwnerId).toBe(owner?.id);
      expect(member?.memberships.map((m) => m.id)).toEqual([family.id]);
    }
    expect(getSentEmails()).toHaveLength(3);
  });

  it("requires at least one family member", async () => {
    const { family } = await createSeason();

    await expect(
      adminCaller().admin.addMember(adminAddMemberInput(family, { additionalMembers: [] }))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a member who already has this membership", async () => {
    const { regular } = await createSeason();
    const input = adminAddMemberInput(regular);
    await adminCaller().admin.addMember(input);

    await expect(adminCaller().admin.addMember(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Har redan detta medlemskap"
    });
  });

  it("rejects an unknown membership", async () => {
    const { regular } = await createSeason();

    await expect(
      adminCaller().admin.addMember(adminAddMemberInput(regular, { membershipId: "does-not-exist" }))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a member who already has another membership this season", async () => {
    const { regular, family } = await createSeason();
    const input = memberSignupInput(regular);
    await signUpAndPay(input);

    await expect(
      adminCaller().admin.addMember(
        adminAddMemberInput(family, {
          email: input.email,
          membershipType: MembershipType.FAMILY,
          additionalMembers: [familyMember()]
        })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects more than four family members", async () => {
    const { family } = await createSeason();
    const input = adminAddMemberInput(family, {
      additionalMembers: [familyMember(), familyMember(), familyMember(), familyMember(), familyMember()]
    });

    await expect(adminCaller().admin.addMember(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects duplicate emails within a family", async () => {
    const { family } = await createSeason();
    const input = adminAddMemberInput(family);

    await expect(
      adminCaller().admin.addMember({
        ...input,
        additionalMembers: [familyMember({ email: input.email })]
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("admin: add member, family and season rules", () => {
  it("rejects a membership that isn't on sale", async () => {
    const lastSeason = await createExpiredSeason();

    await expect(
      adminCaller().admin.addMember(adminAddMemberInput(lastSeason.regular))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Medlemskapet går inte att lägga till just nu"
    });
    expect(await prisma.member.count()).toBe(0);
  });

  it("rejects family emails that only differ in case", async () => {
    const { family } = await createSeason();

    await expect(
      adminCaller().admin.addMember(
        adminAddMemberInput(family, {
          email: "case@test.se",
          additionalMembers: [familyMember({ email: "Case@test.se" })]
        })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Alla emailadresser måste vara unika") });
    expect(await prisma.member.count()).toBe(0);
  });

  it("moves a member from last season's family straight away", async () => {
    const lastSeason = await createSeason();
    const kid = familyMember();
    await signUpAndPay(memberSignupInput(lastSeason.family, { additionalMembers: [kid] }));
    await endSeason(lastSeason);
    const thisSeason = await createSeason();
    const input = adminAddMemberInput(thisSeason.family, { additionalMembers: [kid] });

    await adminCaller().admin.addMember(input);

    const newOwner = await findMember(input.email);
    const member = await findMember(kid.email);
    expect(member?.familyMemberShipOwnerId).toBe(newOwner?.id);
    expect(newOwner?.familyMemberShipOwnerId).toBeNull();
  });
});

describe("admin: add family member to an existing family", () => {
  const createFamily = async (kidCount = 1) => {
    const season = await createSeason();
    const input = memberSignupInput(season.family, {
      additionalMembers: Array.from({ length: kidCount }, () => familyMember())
    });
    await signUpAndPay(input);
    const owner = await findMember(input.email);
    return { season, owner: owner! };
  };

  it("adds the member to the owner's family membership and payment", async () => {
    const { season, owner } = await createFamily();
    const kid = familyMember();

    await adminCaller().admin.addFamilyMember({ ownerId: owner.id, member: kid });

    const member = await findMember(kid.email);
    expect(member).toMatchObject({ familyMemberShipOwnerId: owner.id, phone: owner.phone });
    expect(member?.memberships.map((m) => m.id)).toEqual([season.family.id]);
    expect(member?.stripePayments.map((p) => p.id).sort()).toEqual(
      owner.stripePayments.map((p) => p.id).sort()
    );
  });

  it("derives a plus-address when the member shares the owner's email", async () => {
    const { owner } = await createFamily();

    await adminCaller().admin.addFamilyMember({
      ownerId: owner.id,
      member: { firstName: "Kalle", lastName: "Svensson", email: owner.email }
    });

    const [localPart, domain] = owner.email.split("@");
    const member = await findMember(`${localPart}+kalle@${domain}`);
    expect(member?.familyMemberShipOwnerId).toBe(owner.id);
  });

  it("rejects an owner without a family membership", async () => {
    const { regular } = await createSeason();
    const input = memberSignupInput(regular);
    await signUpAndPay(input);
    const owner = await findMember(input.email);

    await expect(
      adminCaller().admin.addFamilyMember({ ownerId: owner!.id, member: familyMember() })
    ).rejects.toThrow("Owner does not have a family membership");
  });

  it("rejects a fifth family member", async () => {
    const { owner } = await createFamily(4);

    await expect(
      adminCaller().admin.addFamilyMember({ ownerId: owner.id, member: familyMember() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Familjen har redan 4 familjemedlemmar" });
  });

  it("attaches the current season's membership when the owner was also a member last season", async () => {
    const lastSeason = await createSeason();
    const input = memberSignupInput(lastSeason.family);
    await signUpAndPay(input);
    await endSeason(lastSeason);
    const thisSeason = await createSeason();
    await signUpAndPay({ ...input, membershipId: thisSeason.family.id });
    const owner = await findMember(input.email);
    const kid = familyMember();

    await adminCaller().admin.addFamilyMember({ ownerId: owner!.id, member: kid });

    const member = await findMember(kid.email);
    expect(member?.memberships.map((m) => m.id)).toEqual([thisSeason.family.id]);
  });
});

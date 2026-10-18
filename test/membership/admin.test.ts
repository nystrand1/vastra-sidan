import { MembershipType, StripePaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { adminCaller, publicCaller, userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import {
  adminAddMemberInput,
  createExpiredSeason,
  createSeason,
  familyMember,
  memberSignupInput
} from "../helpers/factories";
import { signUpAndPay } from "../helpers/flows";
import { itKnownBug } from "../helpers/knownBug";
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

  // Known bug: the public flow blocks any membership in the same season (wordpressId),
  // the admin flow only blocks the exact same membership id.
  itKnownBug("rejects a member who already has another membership this season", async () => {
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

  // Known bug: adminAddMemberSchema has no upper limit on family members.
  itKnownBug("rejects more than four family members", async () => {
    const { family } = await createSeason();
    const input = adminAddMemberInput(family, {
      additionalMembers: [familyMember(), familyMember(), familyMember(), familyMember(), familyMember()]
    });

    await expect(adminCaller().admin.addMember(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // Known bug: adminAddMemberSchema doesn't have the unique-email refinement of memberSignupSchema.
  itKnownBug("rejects duplicate emails within a family", async () => {
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

  // Known bug: addFamilyMember doesn't check the 1 + 4 limit.
  itKnownBug("rejects a fifth family member", async () => {
    const { owner } = await createFamily(4);

    await expect(
      adminCaller().admin.addFamilyMember({ ownerId: owner.id, member: familyMember() })
    ).rejects.toThrow();
  });

  // Known bug: the `where` only filters the owner; `owner.memberships[0]` can be last season's.
  itKnownBug("attaches the current season's membership when the owner was also a member last season", async () => {
    const lastSeason = await createExpiredSeason();
    const thisSeason = await createSeason();
    const input = memberSignupInput(lastSeason.family);
    await signUpAndPay(input);
    await signUpAndPay({ ...input, membershipId: thisSeason.family.id });
    const owner = await findMember(input.email);
    const kid = familyMember();

    await adminCaller().admin.addFamilyMember({ ownerId: owner!.id, member: kid });

    const member = await findMember(kid.email);
    expect(member?.memberships.map((m) => m.id)).toEqual([thisSeason.family.id]);
  });
});

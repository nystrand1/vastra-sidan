import { describe, expect, it } from "vitest";
import { userCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { createSeason, endSeason, familyMember, memberSignupInput } from "../helpers/factories";
import { signUpAndPay } from "../helpers/flows";

const memberships = (email: string) => userCaller({ email }).user.getMyMemberships();

const ids = (cards: { id: string }[]) => cards.map((c) => c.id).sort();

describe("Mina medlemskap", () => {
  it("lists my active and expired memberships", async () => {
    const lastSeason = await createSeason();
    const input = memberSignupInput(lastSeason.regular, { email: "anna@test.se" });
    await signUpAndPay(input);
    await endSeason(lastSeason);
    const thisSeason = await createSeason();
    await signUpAndPay({ ...input, membershipId: thisSeason.regular.id });

    const { own, family } = await memberships("anna@test.se");

    const member = await prisma.member.findUniqueOrThrow({ where: { email: "anna@test.se" } });
    expect(own?.memberToken).toBe(member.memberToken);
    expect(own?.active).toEqual([
      expect.objectContaining({ id: thisSeason.regular.id, type: "Ordinarie medlemskap" })
    ]);
    expect(own?.expired).toEqual([expect.objectContaining({ id: lastSeason.regular.id })]);
    expect(family).toEqual([]);
  });

  it("returns nothing when my email has no member", async () => {
    await createSeason();

    expect(await memberships("nobody@test.se")).toEqual({ own: null, family: [] });
  });

  it("shows the family memberships I paid for", async () => {
    const { family } = await createSeason();
    const x = familyMember({ email: "x@test.se", firstName: "Xavier" });
    const y = familyMember({ email: "y@test.se", firstName: "Ylva" });
    await signUpAndPay(
      memberSignupInput(family, { email: "owner@test.se", additionalMembers: [x, y] })
    );

    const res = await memberships("owner@test.se");

    expect(res.own?.active.map((m) => m.id)).toEqual([family.id]);
    expect(res.family.map((f) => f.name).sort()).toEqual(
      [`Xavier ${x.lastName}`, `Ylva ${y.lastName}`].sort()
    );
    for (const f of res.family) {
      expect(f.memberships).toEqual([
        expect.objectContaining({ id: family.id, type: "Familjemedlemskap" })
      ]);
    }
  });

  it("keeps last season's family after the family changes", async () => {
    const lastSeason = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    const y = familyMember({ email: "y@test.se" });
    await signUpAndPay(
      memberSignupInput(lastSeason.family, { email: "owner@test.se", additionalMembers: [x, y] })
    );
    await endSeason(lastSeason);
    const thisSeason = await createSeason();
    await signUpAndPay(
      memberSignupInput(thisSeason.family, { email: "owner@test.se", additionalMembers: [x] })
    );
    await signUpAndPay(memberSignupInput(thisSeason.regular, { email: y.email }));

    // Y still points at the owner and holds a REGULAR membership, so "members whose
    // familyMemberShipOwnerId is me" would show it. Only last season's payment counts.
    const [owner, yMember] = await Promise.all([
      prisma.member.findUniqueOrThrow({ where: { email: "owner@test.se" } }),
      prisma.member.findUniqueOrThrow({ where: { email: y.email }, include: { memberships: true } })
    ]);
    expect(yMember.familyMemberShipOwnerId).toBe(owner.id);
    expect(yMember.memberships).toHaveLength(2);

    const { family } = await memberships("owner@test.se");

    const byName = Object.fromEntries(family.map((f) => [f.name, f.memberships]));
    const xName = `${x.firstName} ${x.lastName}`;
    const yName = `${y.firstName} ${y.lastName}`;
    expect(Object.keys(byName).sort()).toEqual([xName, yName].sort());
    expect(ids(byName[xName]!)).toEqual([lastSeason.family.id, thisSeason.family.id].sort());
    expect(ids(byName[yName]!)).toEqual([lastSeason.family.id]);
  });

  it("does not show a family member the rest of the family", async () => {
    const { family } = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    const y = familyMember({ email: "y@test.se" });
    await signUpAndPay(
      memberSignupInput(family, { email: "owner@test.se", additionalMembers: [x, y] })
    );

    const res = await memberships(x.email);

    expect(res.family).toEqual([]);
    expect(res.own?.active.map((m) => m.id)).toEqual([family.id]);
  });

  it("shows no family on payments without a recorded payer", async () => {
    const { family } = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    await signUpAndPay(memberSignupInput(family, { email: "owner@test.se", additionalMembers: [x] }));
    await prisma.stripePayment.updateMany({ data: { payerEmail: null } });

    for (const email of ["owner@test.se", x.email]) {
      const res = await memberships(email);
      expect(res.family).toEqual([]);
      expect(res.own?.active.map((m) => m.id)).toEqual([family.id]);
    }
  });

  it("records who paid for a membership", async () => {
    const { family } = await createSeason();
    await signUpAndPay(
      memberSignupInput(family, { email: "Owner@Test.se", additionalMembers: [familyMember()] })
    );

    const payments = await prisma.stripePayment.findMany();
    expect(payments.map((p) => p.payerEmail)).toEqual(["owner@test.se", "owner@test.se"]);
  });

  it("shows the whole family as the family only for the membership that payment bought", async () => {
    // Season 1: A buys FAMILY for A and X. Season 2: A and X each buy REGULAR themselves.
    const s1 = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    await signUpAndPay(
      memberSignupInput(s1.family, { email: "a@test.se", additionalMembers: [x] })
    );
    await endSeason(s1);
    const s2 = await createSeason();
    await signUpAndPay(memberSignupInput(s2.regular, { email: "a@test.se" }));
    await signUpAndPay(memberSignupInput(s2.regular, { email: x.email }));

    const { family } = await memberships("a@test.se");

    expect(family).toHaveLength(1);
    expect(ids(family[0]!.memberships)).toEqual([s1.family.id]);
  });

  it("does not show a member who moved to another family their new family's membership", async () => {
    // Season 1: A buys FAMILY for A, X and Y. Season 2: A buys FAMILY for A and X (F2),
    // and B buys FAMILY for B and Y with the same product.
    const s1 = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    const y = familyMember({ email: "y@test.se" });
    await signUpAndPay(
      memberSignupInput(s1.family, { email: "a@test.se", additionalMembers: [x, y] })
    );
    await endSeason(s1);
    const s2 = await createSeason();
    await signUpAndPay(
      memberSignupInput(s2.family, { email: "a@test.se", additionalMembers: [x] })
    );
    await signUpAndPay(
      memberSignupInput(s2.family, { email: "b@test.se", additionalMembers: [y] })
    );

    const { family } = await memberships("a@test.se");

    const byName = Object.fromEntries(family.map((f) => [f.name, ids(f.memberships)]));
    expect(byName[`${x.firstName} ${x.lastName}`]).toEqual([s1.family.id, s2.family.id].sort());
    expect(byName[`${y.firstName} ${y.lastName}`]).toEqual([s1.family.id]);
  });

  it("shows no family on a payment that does not say what it bought", async () => {
    const { family } = await createSeason();
    await signUpAndPay(
      memberSignupInput(family, { email: "owner@test.se", additionalMembers: [familyMember()] })
    );
    await prisma.stripePayment.updateMany({ data: { membershipId: null } });

    expect((await memberships("owner@test.se")).family).toEqual([]);
  });

  it("never includes a family member's card token", async () => {
    const { family } = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    await signUpAndPay(memberSignupInput(family, { email: "owner@test.se", additionalMembers: [x] }));
    const xMember = await prisma.member.findUniqueOrThrow({ where: { email: x.email } });

    const res = await memberships("owner@test.se");

    expect(res.family).toHaveLength(1);
    expect(JSON.stringify(res)).not.toContain(xMember.memberToken);
  });

  it("records what a membership payment bought", async () => {
    const { family } = await createSeason();
    await signUpAndPay(
      memberSignupInput(family, { email: "owner@test.se", additionalMembers: [familyMember()] })
    );

    const payments = await prisma.stripePayment.findMany();
    expect(payments.map((p) => p.membershipId)).toEqual([family.id, family.id]);
  });
});

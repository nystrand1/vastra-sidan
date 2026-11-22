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
      const member = await prisma.member.findUniqueOrThrow({ where: { memberToken: f.memberToken } });
      expect([x.email, y.email]).toContain(member.email);
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

    const byEmail = Object.fromEntries(
      await Promise.all(
        family.map(async (f) => {
          const m = await prisma.member.findUniqueOrThrow({ where: { memberToken: f.memberToken } });
          return [m.email, f.memberships] as const;
        })
      )
    );
    expect(Object.keys(byEmail).sort()).toEqual([x.email, y.email].sort());
    expect(ids(byEmail[x.email]!)).toEqual([lastSeason.family.id, thisSeason.family.id].sort());
    expect(ids(byEmail[y.email]!)).toEqual([lastSeason.family.id]);
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

  it("still tells the payer from the family on payments made before payers were stored", async () => {
    const { family } = await createSeason();
    const x = familyMember({ email: "x@test.se" });
    await signUpAndPay(memberSignupInput(family, { email: "owner@test.se", additionalMembers: [x] }));
    await prisma.stripePayment.updateMany({ data: { payerEmail: null } });

    expect((await memberships("owner@test.se")).family).toHaveLength(1);
    expect((await memberships(x.email)).family).toEqual([]);
  });

  it("records who paid for a membership", async () => {
    const { family } = await createSeason();
    await signUpAndPay(
      memberSignupInput(family, { email: "Owner@Test.se", additionalMembers: [familyMember()] })
    );

    const payments = await prisma.stripePayment.findMany();
    expect(payments.map((p) => p.payerEmail)).toEqual(["owner@test.se", "owner@test.se"]);
  });
});

import { describe, expect, it } from "vitest";
import { shouldAutoSubmitCode } from "~/utils/signInLink";

describe("auto-submitting a code from a link", () => {
  it("submits only when this browser asked for a code for that email", () => {
    expect(shouldAutoSubmitCode("anna@x.se", "Anna@X.se ")).toBe(true);
    expect(shouldAutoSubmitCode("anna@x.se", "attacker@x.se")).toBe(false);
    expect(shouldAutoSubmitCode(null, "anna@x.se")).toBe(false);
  });
});

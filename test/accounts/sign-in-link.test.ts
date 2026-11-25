import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "~/utils/safeCallbackUrl";
import { readSignInLink, shouldAutoSubmitCode } from "~/utils/signInLink";

describe("auto-submitting a code from a link", () => {
  it("submits only when this browser asked for a code for that email", () => {
    expect(shouldAutoSubmitCode("anna@x.se", "Anna@X.se ")).toBe(true);
    expect(shouldAutoSubmitCode("anna@x.se", "attacker@x.se")).toBe(false);
    expect(shouldAutoSubmitCode(null, "anna@x.se")).toBe(false);
  });
});

describe("reading the sign-in link", () => {
  it("reads the email and code from the fragment", () => {
    expect(readSignInLink("#email=anna%2Bvss%40x.se&kod=123456")).toEqual({
      email: "anna+vss@x.se",
      code: "123456"
    });
  });

  it("ignores a fragment without both", () => {
    expect(readSignInLink("")).toBeNull();
    expect(readSignInLink("#email=anna%40x.se")).toBeNull();
    expect(readSignInLink("#kod=123456")).toBeNull();
    expect(readSignInLink("#top")).toBeNull();
  });
});

describe("where to go after sign-in", () => {
  const origin = "https://www.vastrasidan.se";

  it("accepts a path on this site", () => {
    expect(safeCallbackUrl("/profil", origin)).toBe("/profil");
    expect(safeCallbackUrl("/mina-bussresor?resa=1#plats", origin)).toBe("/mina-bussresor?resa=1#plats");
  });

  it("refuses anything that leads to another site", () => {
    for (const value of ["//evil.com", "/\\evil.com", "https://evil.com", "/\t/evil.com", "javascript:alert(1)"]) {
      expect(safeCallbackUrl(value, origin), value).toBeNull();
    }
  });

  it("refuses a missing or repeated value", () => {
    expect(safeCallbackUrl(undefined, origin)).toBeNull();
    expect(safeCallbackUrl(["/profil", "/admin"], origin)).toBeNull();
  });
});

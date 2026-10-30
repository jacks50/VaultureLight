import { describe, expect, it } from "vitest";
import { generatePassword } from "../src/lib/generator";

describe("generatePassword", () => {
  it("has the requested composition", () => {
    for (const [letters, digits, symbols] of [[12, 4, 4], [13, 5, 6], [36, 12, 12]]) {
      const pwd = generatePassword(letters, digits, symbols);
      expect(pwd).toHaveLength(letters + digits + symbols);
      expect(pwd.match(/[a-z]/g)).toHaveLength(Math.ceil(letters / 2));
      expect(pwd.match(/[A-Z]/g)).toHaveLength(Math.floor(letters / 2));
      expect(pwd.match(/[0-9]/g)).toHaveLength(digits);
      expect(pwd.match(/[+*%&=\-!?$/.(){}]/g)).toHaveLength(symbols);
    }
  });

  it("is not deterministic", () => {
    expect(generatePassword(12, 4, 4)).not.toBe(generatePassword(12, 4, 4));
  });
});

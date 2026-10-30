import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decryptVault, decryptWithKey, deriveKey, encryptVault, newSalt, vaultSalt, WrongPasswordError } from "../src/lib/vault";

// Encrypted by tools/vault_tool.py from tests/fixtures/sample.json
const fixture = readFileSync(new URL("./fixtures/sample.vault", import.meta.url), "utf8");
const PASSWORD = "fixture-password";

describe("vault v2", () => {
  it("decrypts a vault produced by vault_tool.py", async () => {
    const { data } = await decryptVault(fixture, PASSWORD);
    expect(data.version).toBe(2);
    expect(data.entries.map((e) => e.name)).toEqual(["Example", "Other"]);
    expect(data.entries[0].password).toBe("s3cr3t-Ünïcødé-🔑");
    expect(data.entries[1].notes).toBe("a note");
  });

  it("rejects a wrong password", async () => {
    await expect(decryptVault(fixture, "nope")).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("keeps the salt and changes the IV on every save", async () => {
    const { data, vaultKey } = await decryptVault(fixture, PASSWORD);
    const a = await encryptVault(data, vaultKey);
    const b = await encryptVault(data, vaultKey);
    expect(vaultSalt(a)).toBe(vaultSalt(fixture));
    expect(a.slice(16, 32)).not.toBe(b.slice(16, 32));
    expect((await decryptWithKey(a, vaultKey)).entries).toEqual(data.entries);
    expect((await decryptVault(b, PASSWORD)).data.entries).toEqual(data.entries);
  });

  it("refuses a key derived for another salt", async () => {
    const other = await deriveKey(PASSWORD, newSalt());
    await expect(decryptWithKey(fixture, other)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("rejects files that are not vaults", async () => {
    await expect(decryptVault("hello", PASSWORD)).rejects.toThrow("Not a vault file");
  });
});

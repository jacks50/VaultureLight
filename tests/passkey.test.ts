import { createHmac, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { enrollDevice, unlockWithDevice } from "../src/lib/passkey";

/** Fake platform authenticator: PRF(credential, salt) = HMAC(credential secret, salt). */
function fakeAuthenticator({ prfOnCreate }: { prfOnCreate: boolean }) {
  const secrets = new Map<string, Buffer>();
  const prf = (id: string, salt: BufferSource) =>
    new Uint8Array(createHmac("sha256", secrets.get(id)!).update(new Uint8Array(salt as ArrayBuffer)).digest());
  const key = (raw: ArrayBuffer | ArrayBufferView) =>
    Buffer.from(ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) : new Uint8Array(raw)).toString("base64url");

  const credentials = {
    async create({ publicKey }: CredentialCreationOptions) {
      const rawId = randomBytes(16);
      secrets.set(rawId.toString("base64url"), randomBytes(32));
      const first = publicKey!.extensions!.prf!.eval!.first;
      return {
        rawId: rawId.buffer.slice(rawId.byteOffset, rawId.byteOffset + 16),
        getClientExtensionResults: () => ({
          prf: { enabled: true, ...(prfOnCreate ? { results: { first: prf(rawId.toString("base64url"), first) } } : {}) },
        }),
      };
    },
    async get({ publicKey }: CredentialRequestOptions) {
      const allowed = publicKey!.allowCredentials!.map((c) => key(c.id)).filter((id) => secrets.has(id));
      const id = allowed[0];
      if (!id) throw new DOMException("no credential", "NotAllowedError");
      const ext = publicKey!.extensions!.prf!;
      const salt = ext.evalByCredential?.[id]?.first ?? ext.eval!.first;
      const rawId = Buffer.from(id, "base64url");
      return {
        rawId: rawId.buffer.slice(rawId.byteOffset, rawId.byteOffset + rawId.length),
        getClientExtensionResults: () => ({ prf: { results: { first: prf(id, salt) } } }),
      };
    },
  };
  Object.defineProperty(globalThis, "navigator", { value: { credentials, userAgent: "test" }, configurable: true });
}

describe.each([true, false])("passkey wrap/unwrap (PRF on create: %s)", (prfOnCreate) => {
  beforeEach(() => fakeAuthenticator({ prfOnCreate }));

  it("unwraps the same raw key", async () => {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const entry = await enrollDevice(new Uint8Array(rawKey), "SALTSALTSALTSALT", "Phone", "me@example.com");
    expect(entry.wrappedKey).not.toContain(Buffer.from(rawKey).toString("base64"));
    const { entry: used, rawKey: unwrapped } = await unlockWithDevice([entry]);
    expect(used.id).toBe(entry.id);
    expect(unwrapped).toEqual(rawKey);
  });

  it("rejects an entry tampered to another vault", async () => {
    const entry = await enrollDevice(crypto.getRandomValues(new Uint8Array(32)), "SALTSALTSALTSALT", "Phone", "");
    await expect(unlockWithDevice([{ ...entry, vaultSalt: "OTHERSALTOTHERSA" }])).rejects.toThrow("does not match");
  });
});

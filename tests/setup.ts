import { webcrypto } from "node:crypto";

// Node 18 has no global WebCrypto; the app only relies on the browser's.
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

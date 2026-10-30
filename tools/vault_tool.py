#!/usr/bin/env python3
"""Gather, review and re-encrypt password vaults.

  gather   decrypt every legacy vault in a folder, merge all entries into a sorted text / JSON file
  encrypt  encrypt a reviewed JSON file (from `gather -j`) into a vault (v2 by default, --legacy for v1)
  decrypt  decrypt a v1 or v2 vault back to JSON (to check or edit it)

Legacy v1 format (Android `vaulture` and web `VaultuReact`):
    [16 chars salt][16 chars IV][base64(AES-256-CBC/PKCS7(json))]
    key = PBKDF2-HMAC-SHA256(password, salt as UTF-8, 65536 iterations, 32 bytes)
    json = {"<passwordUID>": {passwordName, passwordUsername, passwordURL, passwordValue, ...}, ...}

v2 format (new app), same layout as v1 with stronger crypto (parameters are fixed in code, not in the file):
    [16 chars salt][16 chars IV][base64(AES-256-GCM(json) || 16-byte tag)]
    key = PBKDF2-HMAC-SHA256(password, salt as UTF-8, 600000 iterations, 32 bytes)
    json = {"version": 2, "entries": [{id, name, username, url, password, notes, createdAt, updatedAt}]}
    v1 and v2 files look alike; v2 is recognised by a successful GCM decryption.
"""
import argparse
import base64
import getpass
import hashlib
import json
import os
import secrets
import string
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

V1_ITERATIONS = 65536
V2_ITERATIONS = 600_000
V1_FIELDS = ("passwordName", "passwordUsername", "passwordURL", "passwordValue")


# region crypto

def random_chars(n: int) -> str:
    # Salt and IV are random alphanumeric strings, as in both legacy apps
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def split_vault(content: str) -> tuple[bytes, bytes, bytes]:
    content = content.strip()
    salt, iv, payload = content[:16].encode(), content[16:32].encode(), content[32:]
    if len(salt) != 16 or len(iv) != 16 or not payload:
        raise ValueError("not a vault file")
    return salt, iv, base64.b64decode(payload, validate=True)


def decrypt_v1(content: str, password: str) -> str:
    salt, iv, data = split_vault(content)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, V1_ITERATIONS, 32)
    decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    padded = decryptor.update(data) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return (unpadder.update(padded) + unpadder.finalize()).decode("utf-8")


def encrypt_v1(plaintext: str, password: str) -> str:
    salt, iv = random_chars(16), random_chars(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), V1_ITERATIONS, 32)
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(iv.encode())).encryptor()
    return salt + iv + base64.b64encode(encryptor.update(padded) + encryptor.finalize()).decode()


def encrypt_v2(plaintext: str, password: str) -> str:
    salt, iv = random_chars(16), random_chars(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), V2_ITERATIONS, 32)
    return salt + iv + base64.b64encode(AESGCM(key).encrypt(iv.encode(), plaintext.encode("utf-8"), None)).decode()


def decrypt_v2(content: str, password: str) -> str:
    salt, iv, data = split_vault(content)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, V2_ITERATIONS, 32)
    return AESGCM(key).decrypt(iv, data, None).decode("utf-8")


def decrypt_any(content: str, password: str) -> str:
    try:
        return decrypt_v2(content, password)
    except InvalidTag:
        return decrypt_v1(content, password)

# endregion


def write_private(path: Path, text: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(text)


def field(e: dict, name: str) -> str:
    return str(e.get(name) or "").strip()


def ask_new_password() -> str:
    while True:
        password = getpass.getpass("New vault password: ")
        if len(password) < 12:
            print("  warning: fewer than 12 characters, a longer master password is strongly advised", file=sys.stderr)
        if getpass.getpass("Confirm password: ") == password:
            return password
        print("  passwords do not match, try again", file=sys.stderr)


def cmd_gather(args) -> int:
    if not args.folder.is_dir():
        print(f"Not a folder: {args.folder}", file=sys.stderr)
        return 1

    password = getpass.getpass("Vault password: ")
    files = sorted(p for p in (args.folder.rglob("*") if args.recursive else args.folder.iterdir()) if p.is_file())

    # (entry, file mtime, file name)
    collected: list[tuple[dict, float, str]] = []
    for path in files:
        try:
            data = json.loads(decrypt_v1(path.read_text(encoding="utf-8"), password))
            entries = list(data.values()) if isinstance(data, dict) else data
            if not isinstance(entries, list):
                raise ValueError("unexpected JSON structure")
        except Exception as exc:
            print(f"  skipped  {path.name}: {type(exc).__name__}", file=sys.stderr)
            continue
        mtime = path.stat().st_mtime
        collected.extend((e, mtime, str(path.relative_to(args.folder))) for e in entries)
        print(f"  ok       {path.name}: {len(entries)} entries")

    # Alphabetical by name then username; for the same name/username the oldest file comes first.
    collected.sort(key=lambda t: (field(t[0], "passwordName").casefold(),
                                  field(t[0], "passwordUsername").casefold(),
                                  t[1]))

    merged: list[tuple[dict, float, list[str]]] = []
    seen: dict[tuple, list[str]] = {}
    for entry, mtime, source in collected:
        identity = tuple(field(entry, k) for k in V1_FIELDS)
        if not args.keep_duplicates and identity in seen:
            seen[identity].append(source)
            continue
        sources = [source]
        seen[identity] = sources
        merged.append((entry, mtime, sources))

    lines = []
    for entry, mtime, sources in merged:
        lines += [
            f"Name:     {field(entry, 'passwordName')}",
            f"Username: {field(entry, 'passwordUsername')}",
            f"URL:      {field(entry, 'passwordURL')}",
            f"Password: {field(entry, 'passwordValue')}",
            f"Source:   {', '.join(sources)} ({datetime.fromtimestamp(mtime):%Y-%m-%d %H:%M})",
            "",
        ]

    write_private(args.output, "\n".join(lines))
    print(f"\n{len(collected)} entries read, {len(merged)} written to {args.output} (plaintext, chmod 600)")

    if args.json:
        records = [{**{k: field(entry, k) for k in V1_FIELDS},
                    "notes": "",
                    "updateDate": datetime.fromtimestamp(mtime).isoformat(timespec="seconds")}
                   for entry, mtime, _ in merged]
        write_private(args.json, json.dumps(records, indent=2, ensure_ascii=False))
        print(f"{len(records)} entries written to {args.json} (plaintext, chmod 600)")
    return 0


def load_reviewed(path: Path) -> list[dict]:
    """Read a JSON file from `gather -j` (list) or a legacy map; validate every entry."""
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = list(data.values()) if isinstance(data, dict) else data
    if not isinstance(entries, list):
        raise ValueError("expected a JSON array of entries")
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            raise ValueError(f"entry #{i + 1} is not an object")
        if not field(e, "passwordName"):
            raise ValueError(f"entry #{i + 1} has no passwordName")
        if not field(e, "passwordValue"):
            print(f"  warning: '{field(e, 'passwordName')}' has an empty password", file=sys.stderr)
    return entries


def to_v1_payload(entries: list[dict]) -> str:
    out = {}
    for i, e in enumerate(entries):
        uid = str(uuid.uuid4())
        out[uid] = {"passwordId": i, "passwordName": field(e, "passwordName"),
                    "passwordUsername": field(e, "passwordUsername"), "passwordURL": field(e, "passwordURL"),
                    "passwordValue": field(e, "passwordValue"), "loginId": 1, "passwordUID": uid}
    return json.dumps(out, ensure_ascii=False)


def to_v2_payload(entries: list[dict]) -> str:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = []
    for e in entries:
        date = field(e, "updateDate") or field(e, "sourceDate")
        created = datetime.fromisoformat(date).astimezone(timezone.utc).isoformat(timespec="seconds") if date else now
        # Fresh ids: old vault versions reuse the same passwordUID for different values
        out.append({"id": str(uuid.uuid4()), "name": field(e, "passwordName"),
                    "username": field(e, "passwordUsername"), "url": field(e, "passwordURL"),
                    "password": field(e, "passwordValue"), "notes": field(e, "notes"),
                    "createdAt": created, "updatedAt": created})
    return json.dumps({"version": 2, "entries": out}, ensure_ascii=False)


def cmd_encrypt(args) -> int:
    try:
        entries = load_reviewed(args.input)
    except (OSError, ValueError) as exc:
        print(f"Invalid input: {exc}", file=sys.stderr)
        return 1

    password = ask_new_password()
    if args.legacy:
        payload = to_v1_payload(entries)
        vault = encrypt_v1(payload, password)
        roundtrip = decrypt_v1(vault, password)
    else:
        payload = to_v2_payload(entries)
        vault = encrypt_v2(payload, password)
        roundtrip = decrypt_v2(vault, password)
    if roundtrip != payload:
        print("Round-trip check failed, nothing written", file=sys.stderr)
        return 1

    write_private(args.output, vault)
    print(f"{len(entries)} entries encrypted to {args.output} ({'v1 legacy' if args.legacy else 'v2'})")
    return 0


def cmd_decrypt(args) -> int:
    password = getpass.getpass("Vault password: ")
    try:
        plaintext = decrypt_any(args.input.read_text(encoding="utf-8"), password)
    except Exception as exc:
        print(f"Cannot decrypt {args.input}: {type(exc).__name__} (wrong password or not a vault)", file=sys.stderr)
        return 1
    write_private(args.output, json.dumps(json.loads(plaintext), indent=2, ensure_ascii=False))
    print(f"Decrypted to {args.output} (plaintext, chmod 600)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("gather", help="merge all legacy vaults of a folder")
    p.add_argument("folder", type=Path, help="folder containing the encrypted files")
    p.add_argument("-o", "--output", type=Path, default=Path("passwords.txt"), help="output text file")
    p.add_argument("-j", "--json", type=Path, help="also write the merged entries to this JSON file")
    p.add_argument("-r", "--recursive", action="store_true", help="also scan sub-folders")
    p.add_argument("--keep-duplicates", action="store_true",
                   help="keep identical entries found in several files instead of merging them")
    p.set_defaults(func=cmd_gather)

    p = sub.add_parser("encrypt", help="encrypt a reviewed JSON file into a vault")
    p.add_argument("input", type=Path, help="reviewed JSON file (output of gather -j)")
    p.add_argument("-o", "--output", type=Path, default=Path("passwords.vault"), help="output vault file")
    p.add_argument("--legacy", action="store_true", help="write the v1 format readable by vaulture / VaultuReact")
    p.set_defaults(func=cmd_encrypt)

    p = sub.add_parser("decrypt", help="decrypt a v1 or v2 vault to JSON")
    p.add_argument("input", type=Path, help="vault file")
    p.add_argument("-o", "--output", type=Path, default=Path("vault.json"), help="output JSON file")
    p.set_defaults(func=cmd_decrypt)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

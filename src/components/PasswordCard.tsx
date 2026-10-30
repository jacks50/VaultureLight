import type { Entry } from "../lib/vault";
import { IconButton } from "./Icon";

interface PasswordCardProps {
  entry: Entry;
  onOpen: () => void;
  onDelete: () => void;
  onCopy: (label: string, value: string) => void;
}

export function toHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function PasswordCard({ entry, onOpen, onDelete, onCopy }: PasswordCardProps) {
  const href = toHref(entry.url);
  return (
    <article className="card">
      <button type="button" className="card-main" onClick={onOpen}>
        <span className="card-title">{entry.name}</span>
        <span className="card-subtitle">{entry.username || " "}</span>
      </button>
      <div className="card-actions">
        <IconButton
          icon="public"
          label="Open URL"
          disabled={!href}
          onClick={() => href && window.open(href, "_blank", "noopener,noreferrer")}
        />
        <IconButton icon="person" label="Copy username" disabled={!entry.username} onClick={() => onCopy("Username", entry.username)} />
        <IconButton icon="key" label="Copy password" disabled={!entry.password} onClick={() => onCopy("Password", entry.password)} />
        <IconButton icon="delete" label="Delete password" danger onClick={onDelete} />
      </div>
    </article>
  );
}

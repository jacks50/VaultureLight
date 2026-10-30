import { useState } from "react";
import type { Entry } from "../lib/vault";
import { Dialog } from "./Dialog";
import { GeneratorDialog } from "./GeneratorDialog";
import { IconButton } from "./Icon";
import { toHref } from "./PasswordCard";
import { PasswordInput } from "./PasswordInput";

// No autocomplete, autocorrect or spellcheck: browser "enhanced spellcheck" can send field contents to a server
const NO_ASSIST = { autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", spellCheck: false } as const;

export type EntryDraft = Pick<Entry, "name" | "username" | "url" | "password" | "notes">;

interface EntryDialogProps {
  entry: Entry | null;
  onSubmit: (draft: EntryDraft) => void;
  onClose: () => void;
  onCopy: (label: string, value: string) => void;
}

export function EntryDialog({ entry, onSubmit, onClose, onCopy }: EntryDialogProps) {
  const [draft, setDraft] = useState<EntryDraft>(() => ({
    name: entry?.name ?? "",
    username: entry?.username ?? "",
    url: entry?.url ?? "",
    password: entry?.password ?? "",
    notes: entry?.notes ?? "",
  }));
  const [generating, setGenerating] = useState(false);

  const set = (field: keyof EntryDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));
  const valid = draft.name.trim() !== "";

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (valid) onSubmit({ ...draft, name: draft.name.trim(), username: draft.username.trim(), url: draft.url.trim() });
  };

  return (
    <>
      <Dialog
        title={entry ? "Edit password" : "New password"}
        onClose={onClose}
        actions={
          <>
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="button" disabled={!valid} onClick={() => submit()}>
              Confirm
            </button>
          </>
        }
      >
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Name *</span>
            <input className="input" value={draft.name} onChange={set("name")} required autoFocus={!entry} {...NO_ASSIST} />
          </label>
          <label className="field">
            <span>Username</span>
            <div className="input-with-buttons">
              <input className="input" value={draft.username} onChange={set("username")} {...NO_ASSIST} />
              <IconButton icon="copy" label="Copy username" onClick={() => onCopy("Username", draft.username)} />
            </div>
          </label>
          <label className="field">
            <span>URL</span>
            <div className="input-with-buttons">
              <input className="input" value={draft.url} onChange={set("url")} inputMode="url" {...NO_ASSIST} />
              <IconButton
                icon="public"
                label="Open URL"
                disabled={!toHref(draft.url)}
                onClick={() => {
                  const href = toHref(draft.url);
                  if (href) window.open(href, "_blank", "noopener,noreferrer");
                }}
              />
            </div>
          </label>
          <label className="field">
            <span>Password</span>
            <PasswordInput
              value={draft.password}
              onChange={set("password")}
              extra={
                <>
                  <IconButton icon="copy" label="Copy password" onClick={() => onCopy("Password", draft.password)} />
                  <IconButton icon="autorenew" label="Generate a password" onClick={() => setGenerating(true)} />
                </>
              }
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea className="input" rows={3} value={draft.notes} onChange={set("notes")} {...NO_ASSIST} />
          </label>
          <button type="submit" hidden />
        </form>
      </Dialog>
      {generating && (
        <GeneratorDialog
          onClose={() => setGenerating(false)}
          onUse={(password) => {
            setDraft((d) => ({ ...d, password }));
            setGenerating(false);
          }}
        />
      )}
    </>
  );
}

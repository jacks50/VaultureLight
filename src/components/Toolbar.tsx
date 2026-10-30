import { Icon, IconButton } from "./Icon";

interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  dirty: boolean;
  saving: boolean;
  onAdd: () => void;
  onGenerate: () => void;
  onSave: () => void;
  onFingerprint: () => void;
  onSignOut: () => void;
}

export function Toolbar({ search, onSearch, dirty, saving, onAdd, onGenerate, onSave, onFingerprint, onSignOut }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <img className="toolbar-logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
        <h1 className="toolbar-title">VaultureLight</h1>
      </div>
      <label className="search">
        <Icon name="search" />
        <input type="search" spellCheck={false} autoComplete="off" autoCorrect="off" placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search" />
      </label>
      <div className="toolbar-actions">
        <IconButton icon="add" label="New password" onClick={onAdd} />
        <IconButton icon="autorenew" label="Generate a password" onClick={onGenerate} />
        <IconButton
          icon="save"
          label={dirty ? "Save to Google Drive (unsaved changes)" : "Save to Google Drive"}
          className={dirty ? "unsaved" : ""}
          disabled={saving}
          onClick={onSave}
        />
        <IconButton icon="fingerprint" label="Fingerprint unlock" onClick={onFingerprint} />
        <IconButton icon="logout" label="Sign out" onClick={onSignOut} />
      </div>
    </header>
  );
}

// Material Symbols (rounded), inlined at build time: no icon font or library shipped at runtime.
import abc from "@material-symbols/svg-400/rounded/abc.svg?raw";
import add from "@material-symbols/svg-400/rounded/add.svg?raw";
import autorenew from "@material-symbols/svg-400/rounded/autorenew.svg?raw";
import close from "@material-symbols/svg-400/rounded/close.svg?raw";
import copy from "@material-symbols/svg-400/rounded/content_copy.svg?raw";
import del from "@material-symbols/svg-400/rounded/delete.svg?raw";
import emojiSymbols from "@material-symbols/svg-400/rounded/emoji_symbols.svg?raw";
import fingerprint from "@material-symbols/svg-400/rounded/fingerprint.svg?raw";
import key from "@material-symbols/svg-400/rounded/key.svg?raw";
import logout from "@material-symbols/svg-400/rounded/logout.svg?raw";
import numbers from "@material-symbols/svg-400/rounded/numbers.svg?raw";
import person from "@material-symbols/svg-400/rounded/person.svg?raw";
import publicIcon from "@material-symbols/svg-400/rounded/public.svg?raw";
import save from "@material-symbols/svg-400/rounded/save.svg?raw";
import search from "@material-symbols/svg-400/rounded/search.svg?raw";
import uploadFile from "@material-symbols/svg-400/rounded/upload_file.svg?raw";
import visibility from "@material-symbols/svg-400/rounded/visibility.svg?raw";
import visibilityOff from "@material-symbols/svg-400/rounded/visibility_off.svg?raw";

const ICONS = {
  abc, add, autorenew, close, copy, delete: del, emojiSymbols, fingerprint, key, logout, numbers, person,
  public: publicIcon, save, search, uploadFile, visibility, visibilityOff,
};

export type IconName = keyof typeof ICONS;

// Keep only the path data; size and color come from CSS (1em, currentColor)
const PATHS = Object.fromEntries(
  Object.entries(ICONS).map(([name, svg]) => [name, [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])]),
) as Record<IconName, string[]>;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  danger?: boolean;
}

export function IconButton({ icon, label, danger, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button${danger ? " danger" : ""} ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

import { useState } from "react";
import { generatePassword, LIMITS } from "../lib/generator";
import { Dialog } from "./Dialog";
import { Icon, IconButton, type IconName } from "./Icon";

interface GeneratorDialogProps {
  onClose: () => void;
  /** When set, a "Use" button hands the password back (entry dialog); otherwise it is copied. */
  onUse?: (password: string) => void;
  onCopy?: (password: string) => void;
}

export function GeneratorDialog({ onClose, onUse, onCopy }: GeneratorDialogProps) {
  const [letters, setLetters] = useState<number>(LIMITS.letters.initial);
  const [digits, setDigits] = useState<number>(LIMITS.digits.initial);
  const [symbols, setSymbols] = useState<number>(LIMITS.symbols.initial);
  const [password, setPassword] = useState(() => generatePassword(letters, digits, symbols));

  const update = (l: number, d: number, s: number) => {
    setLetters(l);
    setDigits(d);
    setSymbols(s);
    setPassword(generatePassword(l, d, s));
  };

  const slider = (icon: IconName, label: string, limits: { min: number; max: number }, value: number, set: (v: number) => void) => (
    <label className="slider-row" title={label}>
      <span className="slider-icon">
        <Icon name={icon} />
      </span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step={1}
        value={value}
        aria-label={label}
        onChange={(e) => set(Number(e.target.value))}
      />
      <span className="slider-value">{value}</span>
    </label>
  );

  return (
    <Dialog
      title="Generate a new password"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          {onUse ? (
            <button type="button" className="button" onClick={() => onUse(password)}>
              Use
            </button>
          ) : (
            <button type="button" className="button" onClick={() => onCopy?.(password)}>
              Copy
            </button>
          )}
        </>
      }
    >
      {slider("abc", "Letters", LIMITS.letters, letters, (v) => update(v, digits, symbols))}
      {slider("numbers", "Numbers", LIMITS.digits, digits, (v) => update(letters, v, symbols))}
      {slider("emojiSymbols", "Symbols", LIMITS.symbols, symbols, (v) => update(letters, digits, v))}
      <p className="hint">
        Password with {letters + digits + symbols} characters: {letters} letters, {digits} numbers and {symbols} symbols
      </p>
      <div className="input-with-buttons">
        <input className="input generated" readOnly value={password} aria-label="Generated password" />
        <IconButton icon="autorenew" label="Generate again" onClick={() => setPassword(generatePassword(letters, digits, symbols))} />
      </div>
    </Dialog>
  );
}

import { useState } from "react";
import { IconButton } from "./Icon";

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  extra?: React.ReactNode;
}

/** Password field with a show/hide toggle; `extra` adds more buttons inside the field. */
export function PasswordInput({ extra, className = "", ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`input-with-buttons ${className}`}>
      <input
        {...rest}
        type={visible ? "text" : "password"}
        className="input"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <IconButton
        icon={visible ? "visibilityOff" : "visibility"}
        label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
      />
      {extra}
    </div>
  );
}

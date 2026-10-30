import { useEffect, useRef } from "react";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  actions: React.ReactNode;
}

/** Modal dialog on top of the native <dialog> element (focus trap, Escape to close). */
export function Dialog({ title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <h2 className="dialog-title">{title}</h2>
      <div className="dialog-content">{children}</div>
      <div className="dialog-actions">{actions}</div>
    </dialog>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`button ${danger ? "danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}

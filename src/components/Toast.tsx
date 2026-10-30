import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(undefined);

  const show = useCallback((message: string, type: ToastType = "info") => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), type, message });
    timer.current = window.setTimeout(() => setToast(null), type === "error" ? 6000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} className={`toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

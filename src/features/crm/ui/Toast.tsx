import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Toast preto, centralizado embaixo, some em 2,6 s (classe .toast / .toast.on do CSS) */
export function Toast({ texto, on }: { texto: string; on: boolean }) {
  const node = (
    <div className="crm-root crm-portal">
      <div className={`toast ${on ? "on" : ""}`.trim()}>{texto}</div>
    </div>
  );
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

export function useToast(): { toast: (t: string) => void; node: ReactNode } {
  const [estado, setEstado] = useState({ texto: "", on: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((texto: string) => {
    setEstado({ texto, on: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado((s) => ({ ...s, on: false })), 2600);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { toast, node: <Toast texto={estado.texto} on={estado.on} /> };
}

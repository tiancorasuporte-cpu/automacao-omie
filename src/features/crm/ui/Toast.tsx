import { useCallback, type ReactNode } from "react";

import { notifyOk } from "@/lib/notify";

/** Compat: CRM agora usa o toast global (sonner) no canto. */
export function Toast(_props: { texto: string; on: boolean }) {
  return null;
}

export function useToast(): { toast: (t: string) => void; node: ReactNode } {
  const toast = useCallback((texto: string) => {
    notifyOk(texto);
  }, []);
  return { toast, node: null };
}

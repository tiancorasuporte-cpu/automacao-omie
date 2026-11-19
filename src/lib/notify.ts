import { toast } from "sonner";

const OK_MS = 4200;
const ERR_MS = 6500;
const INFO_MS = 4200;

/** Sucesso — canto superior direito, some sozinho, dá pra fechar. */
export function notifyOk(text: string) {
  const msg = text.trim();
  if (!msg) return;
  toast.success(msg, { duration: OK_MS, closeButton: true });
}

/** Erro / validação. */
export function notifyError(text: string) {
  const msg = text.trim();
  if (!msg) return;
  toast.error(msg, { duration: ERR_MS, closeButton: true });
}

/** Aviso neutro / info. */
export function notifyInfo(text: string) {
  const msg = text.trim();
  if (!msg) return;
  toast.message(msg, { duration: INFO_MS, closeButton: true });
}

export function notifyDismiss() {
  toast.dismiss();
}

export type FeedbackPayload = {
  type: "ok" | "error" | "info";
  text: string;
};

/**
 * Drop-in de `setFeedback({ type, text } | null)` — não guarda estado na página.
 * `null` / vazio só descarta toasts atuais (opcional).
 */
export function notifyFeedback(fb: FeedbackPayload | null | undefined) {
  if (!fb?.text?.trim()) return;
  if (fb.type === "error") notifyError(fb.text);
  else if (fb.type === "info") notifyInfo(fb.text);
  else notifyOk(fb.text);
}

/** Drop-in quando a página usava string + flag de sucesso. */
export function notifyText(text: string | null | undefined, ok = false) {
  if (!text?.trim()) return;
  if (ok) notifyOk(text);
  else notifyError(text);
}

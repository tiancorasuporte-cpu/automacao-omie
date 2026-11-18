import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { msgErro } from "./utils";

interface ModalProps {
  titulo: ReactNode;
  onClose: () => void;
  /** corpo (.mbody) */
  children: ReactNode;
  /** rodapé (.mfoot) — botões */
  rodape: ReactNode;
  /** modal largo (Regras de comissão) */
  largo?: boolean;
}

/** Overlay (.modal.on) + caixa (.mbox). Clicar fora fecha (igual ao protótipo). */
export function Modal({ titulo, onClose, children, rodape, largo }: ModalProps) {
  const estilo: CSSProperties | undefined = largo
    ? { maxWidth: "760px", width: "96vw" }
    : undefined;
  const node = (
    <div className="crm-root crm-portal">
      <div
        className="modal on"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="mbox" style={estilo}>
          <h3>{titulo}</h3>
          <div className="mbody">{children}</div>
          <div className="mfoot">{rodape}</div>
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

/** Mensagem de erro vermelha do modal (.err) */
export function ModalErro({ msg }: { msg: string }) {
  return (
    <div className="err" style={{ display: msg ? "block" : "none" }}>
      {msg}
    </div>
  );
}

/**
 * Controla o envio do modal: `enviar(fn)` — se `fn` devolver texto, ele é o erro de validação (nada é enviado);
 * se lançar exceção, a mensagem aparece no modal.
 */
export function useSubmeter() {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const vivo = useRef(false);
  const enviar = useCallback(async (fn: () => Promise<string | void> | string | void) => {
    if (vivo.current) return;
    vivo.current = true;
    setErro("");
    setOcupado(true);
    try {
      const r = await fn();
      if (typeof r === "string" && r) setErro(r);
    } catch (e) {
      setErro(msgErro(e));
    } finally {
      vivo.current = false;
      setOcupado(false);
    }
  }, []);
  return { erro, setErro, ocupado, enviar };
}

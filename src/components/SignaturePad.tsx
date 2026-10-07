import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { Icon } from "@/components/Icon";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toDataUrl: () => string | null;
};

const WIDTH = 900;
const HEIGHT = 300;

/** Resolução interna fixa: girar o celular ou redimensionar não apaga o traço. */
export const SignaturePad = forwardRef<SignaturePadHandle, { disabled?: boolean }>(
  function SignaturePad({ disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const dirty = useRef(false);
    const [hasInk, setHasInk] = useState(false);

    function context() {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return null;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#111827";
      return ctx;
    }

    function point(event: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * WIDTH,
        y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      };
    }

    function clear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      dirty.current = false;
      setHasInk(false);
    }

    useImperativeHandle(ref, () => ({
      isEmpty: () => !dirty.current,
      clear,
      toDataUrl: () => {
        const canvas = canvasRef.current;
        if (!canvas || !dirty.current) return null;
        const out = document.createElement("canvas");
        out.width = WIDTH;
        out.height = HEIGHT;
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(canvas, 0, 0);
        return out.toDataURL("image/png");
      },
    }));

    return (
      <div className="space-y-xs">
        <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-outline-variant bg-white">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="block aspect-[3/1] w-full touch-none"
            style={{ cursor: disabled ? "not-allowed" : "crosshair" }}
            onPointerDown={(event) => {
              if (disabled) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = true;
              const p = point(event);
              last.current = p;
              const ctx = context();
              if (ctx) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = "#111827";
                ctx.fill();
              }
              dirty.current = true;
              setHasInk(true);
            }}
            onPointerMove={(event) => {
              if (!drawing.current || !last.current) return;
              const ctx = context();
              if (!ctx) return;
              const p = point(event);
              ctx.beginPath();
              ctx.moveTo(last.current.x, last.current.y);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              last.current = p;
            }}
            onPointerUp={() => {
              drawing.current = false;
              last.current = null;
            }}
            onPointerCancel={() => {
              drawing.current = false;
              last.current = null;
            }}
          />
          {!hasInk ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-xs text-label-md text-on-surface-variant/70">
              <Icon name="draw" className="text-[20px]" />
              Assine aqui com o dedo ou o mouse
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-outline-variant" />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clear}
            disabled={disabled || !hasInk}
            className="inline-flex items-center gap-xs rounded-lg px-sm py-xs text-label-md text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
          >
            <Icon name="ink_eraser" className="text-[18px]" />
            Limpar assinatura
          </button>
        </div>
      </div>
    );
  },
);

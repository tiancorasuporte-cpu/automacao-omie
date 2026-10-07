import { useRef, useState } from "react";

import { Icon } from "@/components/Icon";

export type CapturedPhoto = { foto: string; thumb: string };

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

function render(img: HTMLImageElement, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte a imagens.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Fotos de celular têm vários MB; reduzimos antes de enviar ao servidor. */
export async function compressPhoto(file: File): Promise<CapturedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
  const img = await loadImage(file);
  let foto = render(img, 1280, 0.8);
  if (foto.length > 1_400_000) foto = render(img, 960, 0.7);
  const thumb = render(img, 240, 0.7);
  return { foto, thumb };
}

export function PhotoCapture({
  photos,
  onChange,
  max = 6,
  label = "Fotos da peça",
  disabled,
}: {
  photos: CapturedPhoto[];
  onChange: (photos: CapturedPhoto[]) => void;
  max?: number;
  label?: string;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = photos.length >= max;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...photos];
      for (const file of Array.from(files)) {
        if (next.length >= max) break;
        next.push(await compressPhoto(file));
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar a foto.");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="text-label-md text-primary">{label}</span>
        <span className="text-label-md text-on-surface-variant">
          {photos.length}/{max}
        </span>
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-sm sm:grid-cols-4">
          {photos.map((photo, index) => (
            <div
              key={`${index}-${photo.thumb.length}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container"
            >
              <img src={photo.thumb} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
              {!disabled ? (
                <button
                  type="button"
                  aria-label="Remover foto"
                  onClick={() => onChange(photos.filter((_, i) => i !== index))}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <Icon name="close" className="text-[16px]" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!full && !disabled ? (
        <div className="grid grid-cols-2 gap-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center justify-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-60"
          >
            <Icon name={busy ? "hourglass_empty" : "photo_camera"} className="text-[18px]" />
            {busy ? "Processando..." : "Tirar foto"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="inline-flex items-center justify-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-primary disabled:opacity-60"
          >
            <Icon name="photo_library" className="text-[18px]" />
            Galeria
          </button>
        </div>
      ) : null}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      {error ? (
        <p className="rounded-lg bg-error-container px-sm py-xs text-label-md text-on-error-container">
          {error}
        </p>
      ) : null}
    </div>
  );
}

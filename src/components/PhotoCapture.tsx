import { useCallback, useEffect, useRef, useState } from "react";

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

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = dataUrl;
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

async function compressDataUrl(dataUrl: string): Promise<CapturedPhoto> {
  const img = await loadImageFromDataUrl(dataUrl);
  let foto = render(img, 1280, 0.8);
  if (foto.length > 1_400_000) foto = render(img, 960, 0.7);
  const thumb = render(img, 240, 0.7);
  return { foto, thumb };
}

function attachStream(video: HTMLVideoElement, stream: MediaStream) {
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  if (video.srcObject !== stream) video.srcObject = stream;
  void video.play().catch(() => undefined);
}

async function openCamera() {
  const constraints: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true },
  ];
  let lastError: unknown;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("camera");
}

function cameraUnavailableMessage() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return `A câmera só funciona em HTTPS ou localhost. Abra https://${window.location.host} ou use Galeria.`;
  }
  return "Este navegador não oferece câmera. Use Galeria.";
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return cameraUnavailableMessage();
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "A câmera foi bloqueada. Clique no cadeado da barra de endereço, permita a câmera e tente de novo.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nenhuma câmera foi encontrada neste dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A câmera está em uso por outro programa. Feche o outro app e tente de novo.";
  }
  if (name === "SecurityError") {
    return cameraUnavailableMessage();
  }
  return "Não foi possível acessar a câmera. Permita o uso no navegador ou use Galeria.";
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
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = photos.length >= max;

  useEffect(() => {
    return () => {
      requestId.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const bindVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video || !streamRef.current) return;
    attachStream(video, streamRef.current);
  }, []);

  function stopCamera() {
    requestId.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
    setRequesting(false);
  }

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(cameraUnavailableMessage());
      return;
    }
    const id = requestId.current + 1;
    requestId.current = id;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRequesting(true);
    setLive(false);
    try {
      const stream = await openCamera();
      if (requestId.current !== id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setLive(true);
      setRequesting(false);
      if (videoRef.current) attachStream(videoRef.current, stream);
    } catch (caught) {
      if (requestId.current !== id) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setLive(false);
      setRequesting(false);
      setError(cameraErrorMessage(caught));
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setError("Aguarde a imagem da câmera aparecer e clique em Capturar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Navegador sem suporte a imagens.");
      ctx.drawImage(video, 0, 0, width, height);
      const raw = canvas.toDataURL("image/jpeg", 0.92);
      const photo = await compressDataUrl(raw);
      onChange([...photos, photo].slice(0, max));
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao capturar a foto.");
    } finally {
      setBusy(false);
    }
  }

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

      {live || requesting ? (
        <div className="space-y-sm">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-outline-variant bg-black">
            <video
              ref={bindVideo}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                video.muted = true;
                void video.play().catch(() => undefined);
              }}
              className={`absolute inset-0 h-full w-full object-cover ${live ? "block" : "invisible"}`}
            />
            {requesting ? (
              <div className="absolute inset-0 flex items-center justify-center text-label-md text-white">
                Abrindo câmera…
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <button
              type="button"
              disabled={busy || requesting || !live}
              onClick={() => void captureFrame()}
              className="inline-flex items-center justify-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-60"
            >
              <Icon name={busy ? "hourglass_empty" : "photo_camera"} className="text-[18px]" />
              {busy ? "Processando..." : "Capturar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={stopCamera}
              className="inline-flex items-center justify-center gap-xs rounded-lg border border-outline-variant bg-surface px-md py-sm text-label-md font-semibold text-on-surface disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {!full && !disabled && !live && !requesting ? (
        <div className="grid grid-cols-2 gap-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => void startCamera()}
            className="inline-flex items-center justify-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-on-secondary-container disabled:opacity-60"
          >
            <Icon name="photo_camera" className="text-[18px]" />
            Tirar foto
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

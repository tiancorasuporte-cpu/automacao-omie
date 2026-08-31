import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";

export function FaceCapture({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [live, setLive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      requestId.current += 1;
      stopStream();
    };
  }, []);

  const bindVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video || !streamRef.current) return;
    attachStream(video, streamRef.current);
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }

  function stopCamera() {
    requestId.current += 1;
    stopStream();
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
    stopStream();
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
      stopStream();
      setLive(false);
      setRequesting(false);
      setError(cameraErrorMessage(caught));
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setError("Aguarde a imagem da câmera aparecer e clique em Capturar.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);
    onChange(canvas.toDataURL("image/jpeg", 0.92));
    setError(null);
    stopCamera();
  }

  return (
    <div className="space-y-md">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-2 border-dashed border-outline-variant bg-surface-container">
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
        {!live && value ? (
          <img src={value} alt="Foto capturada" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {!live && !value ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-sm text-on-surface-variant">
            <Icon name="person" className="text-5xl" />
            <span className="text-label-md">
              {requesting ? "Abrindo câmera…" : "Nenhuma foto"}
            </span>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={requesting}
        onClick={live ? captureFrame : startCamera}
        className="flex h-12 w-full items-center justify-center gap-xs rounded-lg bg-secondary-container px-md text-sm font-bold text-on-secondary-container shadow-elevation-1 disabled:opacity-70"
      >
        <Icon name="photo_camera" className="text-sm" />
        {requesting ? "Abrindo câmera…" : live ? "Capturar" : "Tirar Foto (Webcam)"}
      </button>
      {live || requesting ? (
        <button
          type="button"
          onClick={stopCamera}
          className="flex h-10 w-full items-center justify-center rounded-lg text-label-md text-on-surface-variant"
        >
          Cancelar câmera
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex h-12 w-full items-center justify-center gap-xs rounded-lg border border-outline bg-surface-container-lowest px-md text-sm font-semibold text-primary"
      >
        <Icon name="upload" className="text-sm" />
        Carregar Foto
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 1_800_000) {
            setError("A foto deve ter menos de 1.8 MB.");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              stopCamera();
              onChange(reader.result);
              setError(null);
            }
          };
          reader.readAsDataURL(file);
        }}
      />
      {error ? (
        <p className="rounded-lg bg-error-container px-sm py-sm text-label-md text-on-error-container">
          {error}
        </p>
      ) : null}
    </div>
  );
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
    { audio: false, video: true },
    { audio: false, video: { facingMode: "user" } },
  ];
  let lastError: unknown;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("webcam");
}

function cameraUnavailableMessage() {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return `A webcam só funciona em HTTPS ou localhost. Abra https://${window.location.host} (com https, não http) ou use Carregar Foto.`;
  }
  return "Este navegador não oferece webcam. Use Carregar Foto.";
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
    return "Nenhuma webcam foi encontrada neste computador.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "A webcam está em uso por outro programa. Feche o outro app e tente de novo.";
  }
  if (name === "SecurityError") {
    return cameraUnavailableMessage();
  }
  return "Não foi possível acessar a webcam. Permita o uso da câmera no navegador ou use Carregar Foto.";
}

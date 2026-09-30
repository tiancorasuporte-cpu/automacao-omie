import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = "standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIos()) {
      setShowIosTip(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
    setDeferred(null);
    setShowIosTip(false);
  };

  const install = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-x-margin-mobile bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))] z-40 rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-lg md:bottom-lg md:left-auto md:right-lg md:w-[min(22rem,calc(100vw-2rem))]",
      )}
    >
      <div className="flex items-start gap-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-container">
          <Icon name="install_mobile" className="text-[22px] text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-title-md text-primary">Instalar no celular</p>
          {showIosTip && !deferred ? (
            <p className="mt-xs text-body-md text-on-surface-variant">
              No Safari: toque em <strong>Compartilhar</strong> e depois em{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p className="mt-xs text-body-md text-on-surface-variant">
              Adicione o app à tela inicial para abrir rápido, como um aplicativo.
            </p>
          )}
          <div className="mt-sm flex flex-wrap gap-sm">
            {deferred ? (
              <button
                type="button"
                disabled={installing}
                onClick={() => void install()}
                className="inline-flex items-center gap-xs rounded-lg bg-secondary-container px-md py-sm text-label-md font-semibold text-primary disabled:opacity-60"
              >
                <Icon name="download" className="text-[18px]" />
                {installing ? "Abrindo..." : "Instalar"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-md py-sm text-label-md font-semibold text-on-surface-variant hover:bg-surface-container-high"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

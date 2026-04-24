import { useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isRunningAsInstalledApp = () => {
  if (typeof window === 'undefined') return false;
  const inStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return inStandaloneDisplay || iosStandalone;
};

export default function PwaInstallModal() {
  const [open, setOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    const installed = isRunningAsInstalledApp();
    setIsInstalled(installed);

    if (!installed) {
      // Always show on each new page load when app is not installed.
      setOpen(true);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (!isRunningAsInstalledApp()) setOpen(true);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setOpen(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const canTriggerNativePrompt = useMemo(() => deferredPrompt !== null, [deferredPrompt]);

  const handleInstallNow = async () => {
    if (!deferredPrompt || isPrompting) return;

    setIsPrompting(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setOpen(false);
      }
      setDeferredPrompt(null);
    } finally {
      setIsPrompting(false);
    }
  };

  if (!open || isInstalled) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-indigo-200/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-6 text-white shadow-2xl sm:p-8 animate-modal-bounce-in">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/90 shadow-lg shadow-indigo-600/40">
            <i className="fa-solid fa-mobile-screen-button text-2xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Instale o Smart Cria</h2>
            <p className="mt-1 text-sm text-slate-300 sm:text-base">
              Acesso mais rapido, experiencia de app e melhor desempenho no celular.
            </p>
          </div>
        </div>

        <div className="mb-6 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          <p className="flex items-start gap-2">
            <i className="fa-solid fa-check mt-1 text-emerald-400" />
            Abra o sistema direto da tela inicial.
          </p>
          <p className="flex items-start gap-2">
            <i className="fa-solid fa-check mt-1 text-emerald-400" />
            Carregamento mais rapido com recursos em cache.
          </p>
          <p className="flex items-start gap-2">
            <i className="fa-solid fa-check mt-1 text-emerald-400" />
            Experiencia parecida com aplicativo nativo.
          </p>
        </div>

        {canTriggerNativePrompt ? (
          <button
            type="button"
            onClick={handleInstallNow}
            disabled={isPrompting}
            className="w-full rounded-2xl bg-indigo-500 px-5 py-4 text-lg font-semibold transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPrompting ? 'Abrindo instalacao...' : 'Instalar agora'}
          </button>
        ) : (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
            Quando o navegador liberar, use o menu (⋮) e toque em <strong>Instalar app</strong>.
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 w-full rounded-2xl border border-white/20 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Continuar na versao web
        </button>
      </div>
    </div>
  );
}

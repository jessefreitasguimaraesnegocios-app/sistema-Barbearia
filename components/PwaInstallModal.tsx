import { useEffect, useMemo, useState } from 'react';
import {
  getPwaInstallPlatform,
  isIosNonSafariBrowser,
  isRunningAsInstalledApp,
  type PwaInstallPlatform,
} from '../lib/pwaPlatform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function IosInstallSteps() {
  return (
    <ol className="space-y-3 text-sm text-slate-200">
      <li className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-200">
          1
        </span>
        <span>
          Toque em <strong className="text-white">Compartilhar</strong>{' '}
          <i className="fa-solid fa-arrow-up-from-bracket mx-0.5 text-indigo-300" aria-hidden /> na barra do Safari
          (ícone com seta para cima).
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-200">
          2
        </span>
        <span>
          Role e escolha <strong className="text-white">Adicionar à Tela de Início</strong>{' '}
          <i className="fa-regular fa-square-plus mx-0.5 text-indigo-300" aria-hidden />.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-200">
          3
        </span>
        <span>
          Confirme em <strong className="text-white">Adicionar</strong>. O ícone do Smart Cria aparecerá na tela
          inicial.
        </span>
      </li>
    </ol>
  );
}

function InstallInstructions({
  platform,
  iosNeedsSafari,
  canTriggerNativePrompt,
  isPrompting,
  onInstall,
}: {
  platform: PwaInstallPlatform;
  iosNeedsSafari: boolean;
  canTriggerNativePrompt: boolean;
  isPrompting: boolean;
  onInstall: () => void;
}) {
  if (canTriggerNativePrompt) {
    return (
      <button
        type="button"
        onClick={onInstall}
        disabled={isPrompting}
        className="w-full rounded-2xl bg-indigo-500 px-5 py-4 text-lg font-semibold transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPrompting ? 'Abrindo confirmação...' : 'Instalar agora'}
      </button>
    );
  }

  if (platform === 'ios') {
    return (
      <>
        {iosNeedsSafari && (
          <div className="mb-4 rounded-2xl border border-sky-300/35 bg-sky-500/15 px-4 py-3 text-sm text-sky-100">
              Para instalar no iPhone, abra esta página no <strong>Safari</strong> (copie o link e cole no Safari ou use{' '}
              <strong>Abrir no Safari</strong> no menu do navegador).
            </div>
        )}
        <div className="rounded-2xl border border-indigo-300/25 bg-indigo-500/10 px-4 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-indigo-200">iPhone / iPad</p>
          <IosInstallSteps />
        </div>
      </>
    );
  }

  if (platform === 'android') {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
        Abra o menu do Chrome <i className="fa-solid fa-ellipsis-vertical mx-0.5" aria-hidden /> e toque em{' '}
        <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
      No menu do navegador, procure por <strong>Instalar</strong> ou <strong>Adicionar à tela inicial</strong>.
    </div>
  );
}

export default function PwaInstallModal() {
  const [open, setOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);
  const [platform, setPlatform] = useState<PwaInstallPlatform>(() => getPwaInstallPlatform());
  const [iosNeedsSafari, setIosNeedsSafari] = useState(false);

  useEffect(() => {
    setPlatform(getPwaInstallPlatform());
    setIosNeedsSafari(isIosNonSafariBrowser());

    const installed = isRunningAsInstalledApp();
    setIsInstalled(installed);

    if (!installed) {
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
    setOpen(false);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome !== 'accepted' && !isRunningAsInstalledApp()) setOpen(true);
      setDeferredPrompt(null);
    } finally {
      setIsPrompting(false);
    }
  };

  if (!open || isInstalled) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/55 backdrop-blur-md safe-modal-padding">
      <div className="w-full max-w-lg max-h-[min(92dvh,100%)] overflow-y-auto rounded-3xl border border-indigo-200/30 bg-linear-to-b from-slate-900/95 to-slate-950/95 p-6 text-white shadow-2xl sm:p-8 animate-modal-bounce-in">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600/90 shadow-lg shadow-indigo-600/40">
            <i
              className={`text-2xl ${platform === 'ios' ? 'fa-brands fa-apple' : 'fa-solid fa-mobile-screen-button'}`}
              aria-hidden
            />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Instale o Smart Cria</h2>
            <p className="mt-1 text-sm text-slate-300 sm:text-base">
              {platform === 'ios'
                ? 'No iPhone, adicione à Tela de Início pelo Safari para abrir como app.'
                : 'Acesso mais rápido, experiência de app e melhor desempenho no celular.'}
            </p>
          </div>
        </div>

        <div className="mb-6 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          <p className="flex items-start gap-2">
            <i className="fa-solid fa-check mt-1 text-emerald-400" aria-hidden />
            Abra o sistema direto da tela inicial.
          </p>
          <p className="flex items-start gap-2">
            <i className="fa-solid fa-check mt-1 text-emerald-400" aria-hidden />
            Carregamento mais rápido com recursos em cache.
          </p>
          <p className="flex items-start gap-2">
            <i className="fa-solid fa-check mt-1 text-emerald-400" aria-hidden />
            Experiência parecida com aplicativo nativo.
          </p>
        </div>

        <InstallInstructions
          platform={platform}
          iosNeedsSafari={iosNeedsSafari}
          canTriggerNativePrompt={canTriggerNativePrompt}
          isPrompting={isPrompting}
          onInstall={handleInstallNow}
        />

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 w-full rounded-2xl border border-white/20 px-5 py-3 text-sm text-slate-200 transition hover:bg-white/10"
        >
          Continuar na versão web
        </button>
      </div>
    </div>
  );
}

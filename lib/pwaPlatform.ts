/** Detecção de PWA / plataforma móvel (Safari iOS, Chrome Android, etc.). */

export function isRunningAsInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const inStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return inStandaloneDisplay || iosStandalone;
}

/** iPhone, iPad, iPod e iPadOS com user-agent de Mac + touch. */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/** Chrome, Firefox, Edge etc. no iOS — instalação PWA só via Safari. */
export function isIosNonSafariBrowser(): boolean {
  if (!isIosDevice()) return false;
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(navigator.userAgent);
}

export type PwaInstallPlatform = 'ios' | 'android' | 'other';

export function getPwaInstallPlatform(): PwaInstallPlatform {
  if (isIosDevice()) return 'ios';
  if (isAndroidDevice()) return 'android';
  return 'other';
}

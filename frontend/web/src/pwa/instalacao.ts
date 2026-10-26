export interface AmbienteInstalacao {
  userAgent: string;
  maxTouchPoints: number;
  /** `matchMedia('(display-mode: standalone)').matches` */
  standalone: boolean;
  /** `navigator.standalone` (só existe no Safari do iOS). */
  navigatorStandalone: boolean | undefined;
}

const IOS_COM_NOME = /\b(iPhone|iPod|iPad)\b/;
// Navegadores de terceiros no iOS e navegadores embutidos em outros apps não têm "Adicionar à Tela de Início".
const NAO_SAFARI = /\b(CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line)\b/;
const ANDROID = /\bAndroid\b/;

/** iPhone, iPod, iPad e iPadOS (que se apresenta como Mac, mas tem tela de toque). */
function ehIos(userAgent: string, maxTouchPoints: number): boolean {
  if (ANDROID.test(userAgent)) return false;
  if (IOS_COM_NOME.test(userAgent)) return true;
  return /\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1;
}

/** Avisa como instalar só no Safari do iOS e só enquanto o app não está instalado. */
export function deveMostrarAvisoInstalacao(ambiente: AmbienteInstalacao): boolean {
  const { userAgent, maxTouchPoints, standalone, navigatorStandalone } = ambiente;
  if (!ehIos(userAgent, maxTouchPoints)) return false;
  if (NAO_SAFARI.test(userAgent)) return false;
  return !standalone && navigatorStandalone !== true;
}

/** Lê o aparelho e decide. Fora do navegador (ou sem `matchMedia`), não mostra. */
export function lerAmbienteEDecidir(): boolean {
  if (typeof navigator === 'undefined' || typeof matchMedia === 'undefined') return false;
  const comStandalone = navigator as Navigator & { standalone?: boolean };
  return deveMostrarAvisoInstalacao({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: comStandalone.standalone,
  });
}

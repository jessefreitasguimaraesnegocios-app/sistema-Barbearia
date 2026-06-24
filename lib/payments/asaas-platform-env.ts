import type { AsaasRuntimeMode } from './resolve-shop-split';

const DEFAULT_PROD_URL = 'https://api.asaas.com/v3';
const DEFAULT_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';

/** Credenciais da conta mãe Asaas (plataforma) conforme `platform_runtime_settings.asaas_mode`. */
export function buildAsaasPlatformCredentials(mode: AsaasRuntimeMode): {
  mode: AsaasRuntimeMode;
  apiKey: string;
  apiUrl: string;
} {
  if (mode === 'sandbox') {
    return {
      mode,
      apiKey: (process.env.ASAAS_API_KEY_SANDBOX || process.env.ASAAS_API_KEY || '').trim(),
      apiUrl: (process.env.ASAAS_API_URL_SANDBOX || process.env.ASAAS_API_URL || DEFAULT_SANDBOX_URL).replace(
        /\/$/,
        '',
      ),
    };
  }
  return {
    mode,
    apiKey: (process.env.ASAAS_API_KEY || '').trim(),
    apiUrl: (process.env.ASAAS_API_URL || DEFAULT_PROD_URL).replace(/\/$/, ''),
  };
}

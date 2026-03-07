// Declarações para Supabase Edge Functions (runtime Deno) - evita erros no IDE
declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
  const env: {
    get(key: string): string | undefined;
  };
}

// Declarações para Supabase Edge Functions (runtime Deno) - evita erros no IDE
declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
  const env: {
    get(key: string): string | undefined;
  };
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(url: string, key: string): any;
}

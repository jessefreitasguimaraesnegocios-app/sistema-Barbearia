# Variaveis de ambiente - Provisionador Asaas

Este arquivo documenta as variaveis necessarias para integrar o `sistema-Barbearia` com o projeto de subcontas Asaas.

## Variaveis obrigatorias

- `ASAAS_PROVISIONER_URL`
  - URL HTTP da funcao `create-subaccount` do projeto de subcontas.
  - Exemplo:
  - `https://SEU_PROJETO.supabase.co/functions/v1/create-subaccount`

- `ASAAS_PROVISIONER_APP_ID`
  - `app_id` do seu sistema (`sistema-Barbearia`) cadastrado no provisionador.
  - Tipo esperado: UUID (ou o formato adotado no projeto de subcontas).

## Variaveis opcionais

- `ASAAS_PROVISIONER_TOKEN`
  - Token Bearer para autenticar no gateway do provisionador (use apenas se o endpoint exigir autenticacao).
  - Se nao for exigido, deixe sem configurar.

- `ASAAS_PROVISIONER_ENV`
  - Ambiente desejado para criacao de subcontas: `sandbox` ou `production`.
  - Se ausente, o sistema infere pelo `ASAAS_API_URL`:
    - contem `sandbox` -> usa `sandbox`
    - caso contrario -> usa `production`

## Exemplo completo (.env)

```bash
ASAAS_PROVISIONER_URL=https://SEU_PROJETO.supabase.co/functions/v1/create-subaccount
ASAAS_PROVISIONER_APP_ID=00000000-0000-0000-0000-000000000000
ASAAS_PROVISIONER_TOKEN=seu_token_opcional
ASAAS_PROVISIONER_ENV=sandbox
```

## Loja (barbearia) — provisionamento assincrono

Fluxo separado do cadastro de parceiro:

- Edge `process-shop-finance` (secrets: `ASAAS_API_KEY`, `ASAAS_API_URL`; opcional `ASAAS_SHOP_PROVISIONER_URL` / `ASAAS_SHOP_PROVISIONER_TOKEN` / `ASAAS_SHOP_PROVISIONER_APP_ID`).
- Edge `shop-finance-webhook` com `SHOP_FINANCE_WEBHOOK_SECRET` (deploy com `--no-verify-jwt`).
- Admin: botao **Provisionar Asaas** chama `POST /api/admin/process-shop-finance` com JWT de admin.

## Checklist rapido

- Provisionador responde `200` no endpoint `create-subaccount`.
- `ASAAS_PROVISIONER_APP_ID` corresponde ao app correto no banco do provisionador.
- Ambiente (`sandbox`/`production`) esta alinhado com as chaves do Asaas.
- Secrets reais configurados no ambiente de deploy (Vercel/Supabase), sem commitar valores sensiveis.

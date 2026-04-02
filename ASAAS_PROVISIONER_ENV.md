# Provisionador Asaas — variáveis de ambiente

Integração do **sistema-Barbearia** com o projeto de **subcontas Asaas** (função tipo `create-subaccount`).

Tudo aqui também aparece no **[SECRETS_AND_KEYS.md](./SECRETS_AND_KEYS.md)** — esse arquivo é o “modo focado” só no provisionador.

---

## Obrigatórias

### `ASAAS_PROVISIONER_URL`

URL HTTP da função **`create-subaccount`** no projeto de subcontas.

Exemplo:

```text
https://SEU_PROJETO.supabase.co/functions/v1/create-subaccount
```

### `ASAAS_PROVISIONER_APP_ID`

`app_id` do Beauty Hub cadastrado **lá no provisionador** (UUID ou o formato que o outro projeto usar).

---

## Opcionais

### `ASAAS_PROVISIONER_TOKEN`

Bearer se o gateway exigir autenticação. Se o endpoint for aberto (só rede confiável), **não precisa**.

### `ASAAS_PROVISIONER_ENV`

`sandbox` ou `production`.  
Se ficar vazio, o código costuma inferir pelo `ASAAS_API_URL`:

- URL com `sandbox` → ambiente sandbox  
- senão → production  

---

## Exemplo de `.env` (local)

```bash
ASAAS_PROVISIONER_URL=https://SEU_PROJETO.supabase.co/functions/v1/create-subaccount
ASAAS_PROVISIONER_APP_ID=00000000-0000-0000-0000-000000000000
ASAAS_PROVISIONER_TOKEN=opcional_se_precisar
ASAAS_PROVISIONER_ENV=sandbox
```

---

## Loja (barbearia) — outro fluxo

Provisionamento **assíncrono da loja** não é o mesmo que subconta de profissional:

- Edge **`process-shop-finance`** (secrets: `ASAAS_API_KEY`, `ASAAS_API_URL`; opcional `ASAAS_SHOP_PROVISIONER_*`).
- Edge **`shop-finance-webhook`** com `SHOP_FINANCE_WEBHOOK_SECRET` (deploy com `--no-verify-jwt`).
- No admin, **Provisionar Asaas** → `POST /api/admin/process-shop-finance` com JWT de admin.

---

## Antes de dizer “funcionou”

- [ ] `POST` no `create-subaccount` responde **200** no ambiente certo.
- [ ] `ASAAS_PROVISIONER_APP_ID` bate com o cadastro no banco do provisionador.
- [ ] Sandbox vs produção **alinhado** com as chaves Asaas.
- [ ] Secrets no **Vercel** / **Supabase** preenchidos — **zero** segredo real no Git.

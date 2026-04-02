# Checklist de release

Antes de publicar uma versão (produção ou homologação), confirme os itens abaixo.

## Banco e migrations

- [ ] Migrations aplicadas no ambiente alvo (`supabase db push`, pipeline interno ou fluxo que o time usa).
- [ ] Nenhuma migration pendente em `supabase/migrations/` em relação ao banco remoto.

## Smoke manual (rápido)

- [ ] **Cliente** — login/cadastro na home, listagem de lojas, abrir uma loja, fluxo mínimo de agendamento ou navegação sem erro no console.
- [ ] **Parceiro** — login em «Sou parceiro», dashboard da loja carrega, agenda e pedidos sem erro aparente.
- [ ] **Admin** — login em `/admin`, lista de lojas e ações principais da dashboard.
- [ ] **Staff** — login como funcionário, visão restrita (sem onboarding/customização se aplicável), agenda filtrada ao profissional.

## Build e qualidade

- [ ] `npm run lint` e `npm test` passando localmente (ou no CI).
- [ ] `npm run build` conclui sem erros.

## Opcional

- [ ] Edge functions / webhooks Asaas revisados se houve mudança em pagamentos ou provisionamento.

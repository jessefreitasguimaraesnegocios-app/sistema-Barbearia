# Checklist de release

Checklist curto antes de soltar **homologação** ou **produção**. Marca os itens e segue o jogo.

---

## Banco

- [ ] Migrations aplicadas no ambiente certo (`supabase db push`, script do time, etc.).
- [ ] Nada pendente em `supabase/migrations/` que ainda não tenha ido pro banco alvo.

---

## Smoke manual (15–20 min bem usados)

- [ ] **Cliente** — login/cadastro na home, lista lojas, abre uma loja, pelo menos navega agendar/comprar sem erro gritante no console.
- [ ] **Parceiro** — “Sou parceiro”, dashboard carrega, agenda e pedidos fazem sentido.
- [ ] **Admin** — entrou como admin, abriu `/admin`, lista de lojas e ações principais ok.
- [ ] **Staff** — login de funcionário: vê só o que deve (sem painel de dono onde não pode), agenda coerente.

---

## Pipeline local (ou CI)

- [ ] `npm run lint` limpo (ou só warning que o time já aceitou).
- [ ] `npm test` passando.
- [ ] `npm run build` sem erro.

---

## Pagamentos / Asaas (se mexeu)

- [ ] Edge functions e webhooks revisados — URL, secrets, token do webhook, `--no-verify-jwt` onde precisa.

---

Boa release.

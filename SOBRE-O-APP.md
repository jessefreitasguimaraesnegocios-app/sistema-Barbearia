# Beauty Hub — o que o app faz

Sistema para **barbearias e salões**: três mundos no mesmo produto — **cliente**, **parceiro (loja + equipe)** e **admin** — com **PIX via Asaas**, agenda, pedidos e painéis.

**Stack em uma linha:** React + Vite no front · Supabase (auth, Postgres, Realtime, Edge Functions) no back · Asaas nos pagamentos.

---

## Cliente · rota `/`

- **Explorar** lojas (filtro barbearia / salão + busca por nome).
- **Ver loja:** serviços, profissionais, produtos.
- **Agendar** com data, horário e profissional; paga com **PIX**.
- **Comprar** produtos da loja — também PIX.
- **Meus agendamentos:** status (pendente, pago, concluído, cancelado) e cancelamento (com regra de reembolso que o app avisa).
- **Meus pedidos** e **perfil**.
- **Visitante** vê catálogo; para agendar/comprar precisa **conta** (e-mail + senha, etc.).

---

## Parceiro · rota `/parceiros`

Dono da barbearia/salão (e fluxo de login da **equipe**):

- **Login** com o e-mail cadastrado (mesma tela serve contas de loja — quem é admin do sistema também entra por aqui quando o perfil não é “só cliente”).
- **Dashboard:** resumo de agendamentos e pedidos.
- **Personalização:** nome, texto, fotos, cores, tema; cadastro de **serviços**, **profissionais** e **produtos**.
- **Documentos / onboarding Asaas** quando configurado (status e links vêm da API).

**Criar loja nova (fluxo admin):** a Edge Function **`create-shop`** grava loja + dono + perfil `barbearia`.  
O **Asaas não roda nessa hora** — o financeiro da loja entra depois com **Provisionar Asaas** / `process-shop-finance` (ver README técnico). Assim o cadastro fica desacoplado e mais fácil de operar em produção.

---

## Staff (funcionário)

Quem tem perfil **profissional** vinculado à loja:

- Acessa pela mesma área **`/parceiros`**.
- Vê o que a regra de negócio permite (ex.: sem telas de onboarding/customização de dono, agenda pode filtrar só os atendimentos **dele**).

---

## Admin · rota `/admin`

- **Quem é:** usuário com role **`admin`** na tabela `profiles` no Supabase.
- **Como entrar:** faz login em **`/parceiros`** com essa conta; depois abre **`/admin`**.  
  A URL `/admin/login` **redireciona** para `/parceiros` — não existe tela de login separada só para admin.
- **Dashboard:** todas as lojas, criar loja (usa `create-shop`), assinatura, split, provisionamento financeiro, etc.

---

## Integrações rápidas

| Peça | O quê |
|------|--------|
| **Realtime** | Atualização de agendamentos/pedidos sem refresh na cara do usuário |
| **PIX / split** | Asaas; carteiras em `shops` / `professionals` conforme o fluxo |
| **Migrations** | SQL versionado em `supabase/migrations/` |

---

## Resumo

Um **hub** onde o cliente acha loja, agenda e paga; o parceiro (e a equipe) manda no dia a dia; o admin mantém o ecossistema e o financeiro no trilho.

Mais detalhe de deploy e secrets: **[README.md](./README.md)**.

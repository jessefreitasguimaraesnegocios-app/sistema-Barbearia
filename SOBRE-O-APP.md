# Barber & Beauty Hub (BeautyHub)

Sistema para barbearias e salões de beleza com três perfis: **cliente**, **parceiro (loja)** e **admin**. Frontend em React + Vite, backend em Supabase (Auth, DB, Realtime, Edge Functions) e integração com Asaas para pagamentos.

---

## 1. Área do cliente (`/`)

- **Buscar estabelecimentos**: lista de barbearias e salões com filtro (Todos / Barbearias / Salões) e busca por nome.
- **Ver loja**: ao escolher uma loja, vê detalhes, serviços, profissionais e produtos.
- **Agendar**: agendamento de serviço (data, horário, profissional), com pagamento via **PIX** (Asaas).
- **Comprar**: pedido de produtos da loja, também com PIX.
- **Meus agendamentos**: lista de agendamentos, status (Pendente, Pago, Concluído, Cancelado) e cancelamento (com aviso de reembolso de 50%).
- **Meus pedidos**: histórico de pedidos e status.
- **Conta**: login/cadastro (e-mail e senha); visitante pode ver lojas, mas precisa estar logado para agendar/comprar.

---

## 2. Área do parceiro (`/parceiros`)

Para **dono de barbearia/salão**:

- **Login**: acesso com e-mail e senha da loja.
- **Dashboard da loja**: visão geral do estabelecimento (agendamentos, pedidos, etc.).
- **Personalização**: editar nome, descrição, imagens (perfil/banner), cores e tema da loja; cadastrar/editar **serviços**, **profissionais** e **produtos**.

Dados da loja e do dono são criados via Edge Function **create-shop**, que também registra o cliente no **Asaas** (para receber pagamentos PIX, etc.).

---

## 3. Área admin (`/admin`)

- **Login** em `/admin/login`.
- **Dashboard**: lista de todas as lojas cadastradas, com possibilidade de criar novas lojas (fluxo que usa a Edge Function `create-shop` e Asaas).
- Controle de **assinatura** (subscription) e **split** de pagamentos (ex.: 95% para a loja).

---

## Stack e integrações

- **Frontend**: React 19, React Router, Tailwind, Recharts.
- **Backend**: Supabase (Auth, PostgreSQL, Realtime para atualização de agendamentos/pedidos).
- **Pagamentos**: Asaas (PIX); lojas têm `asaas_account_id` / `asaas_wallet_id` e cliente tem `asaas_customer_id`.
- **Migrations**: SQL em `supabase/migrations/` (schema, perfis, lojas, agendamentos, pedidos, produtos, integração Asaas).

---

## Resumo

O app é um **hub** em que clientes encontram barbearias/salões, agendam serviços e compram produtos com PIX; parceiros gerenciam sua loja e oferta; e o admin gerencia lojas e assinaturas.

# Melhorias de egress e performance (parceiro, cliente, admin)

Resumo do que foi implementado para reduzir tráfego Supabase (PostgREST + Realtime), evitar refetches pesados e limitar volume de dados por pedido.

---

## 1. Pedidos da loja (parceiro) — Realtime sem lista inteira

**Ficheiro:** `hooks/useRealtimePartnerOrders.ts`

- Antes: cada evento em `public.orders` disparava `fetchPartnerOrdersWithProfiles` (lista completa + `profiles` em batch).
- Agora: merge local (INSERT / UPDATE / DELETE), no mesmo espírito de `useRealtimeOrders` na área cliente.
- Perfil do cliente: reutiliza `clientDisplayName` / `clientAvatarUrl` já em memória quando o `client_id` é conhecido; caso contrário, um GET mínimo a `profiles` para essa linha.

---

## 2. Bundle da loja (parceiro) — Realtime granular

**Ficheiros:** `hooks/useShop.ts`, `services/supabase/mapPartnerShop.ts`, `services/supabase/shops.ts`

- Antes: qualquer `postgres_changes` em `shops`, `services`, `professionals` ou `products` chamava `reloadShop()` → bundle completo (1 shop + 3 listas).
- Agora:
  - `shops` → `fetchPartnerShopRowOnly` + `mergePartnerShopScalarRow` (só metadados da loja).
  - `services` / `professionals` / `products` → só essa relação (`fetchPartnerServicesForShop`, `fetchPartnerProfessionalsForShop`, `fetchPartnerProductsForShop`).
- `mapPartnerShop.ts`: extraídos `mapPartnerServicesFromRows`, `mapPartnerProfessionalsFromRows`, `mapPartnerProductsFromRows` e `mergePartnerShopScalarRow`; `mapPartnerShopFromBundle` passa a usá-los internamente.

---

## 3. Agendamentos e pedidos parceiro — janela de datas e paginação de pedidos

**Ficheiro:** `services/supabase/partnerShopActivity.ts`

**Agendamentos**

- Filtro por `date` entre **hoje − 45 dias** e **hoje + 20 dias** (`PARTNER_APPOINTMENT_PAST_DAYS`, `PARTNER_APPOINTMENT_FUTURE_DAYS`), em vez de carregar todo o histórico.
- Constantes exportadas: `partnerAgendaDateRange()`, `PARTNER_ORDERS_SELECT`, `mapDbRowToShopPartnerOrderRow`, `sortPartnerOrdersNewestFirst`.

**Pedidos**

- Página recente por `created_at` (**55** linhas): `PARTNER_ORDERS_RECENT_PAGE_SIZE`, `fetchPartnerOrdersRecentPage`, `appendPartnerOrdersRecentPage`.
- Pedidos **DELIVERED** com `handed_over_at` desde o **início do dia civil local** (`startOfLocalDayUtcIso`) são fundidos à primeira carga para o painel “retiradas hoje” não depender só da página recente.
- `loadPartnerShopActivity` devolve `ordersHasMore`.

**Hook e UI**

- `hooks/usePartnerData.ts`: `ordersHasMore`, `ordersLoadingMore`, `loadMorePartnerOrders`, cursor só na query recente (não no tamanho da lista fundida).
- `views/ShopOrders.tsx`: props opcionais `ordersHasMore`, `ordersLoadingMore`, `onLoadMoreOrders` + botão “Carregar mais pedidos (histórico)”.
- `pages/PartnerArea.tsx`: ligação dessas props ao `ShopOrders`.

**Testes:** `services/supabase/partnerShopActivity.test.ts` atualizado para a nova cadeia Supabase (`.gte` / `.lte` em appointments, duas queries em `orders`, etc.).

---

## 4. Detalhe da loja (cliente) — produtos via Realtime sem refetch total

**Ficheiro:** `views/ShopDetails.tsx`

- Antes: cada evento em `products` refazia `select` de **todos** os produtos da loja.
- Agora: merge na lista `liveProducts` a partir do payload (INSERT/UPDATE/DELETE).

---

## 5. Catálogo público — `select` mais enxuto

**Ficheiro:** `services/supabase/shops.ts` — constante `SHOPS_SELECT_CLIENT_CATALOG`

- Removidos do embed da loja (catálogo cliente) campos não usados no fluxo cliente na UI: `cnpj_cpf`, `email`, `phone`, `pix_key`, Asaas (`asaas_account_id`, `asaas_wallet_id`), `split_percent`, `pass_fees_to_customer`.
- Mantidos `subscription_active` / `subscription_amount` para o modelo `Shop` e possíveis regras futuras.

---

## 6. Admin — estatísticas leves + lista paginada

**Ficheiros:** `services/supabase/shops.ts`, `pages/AdminArea.tsx`, `views/AdminDashboard.tsx`

- `fetchAdminShopsAggregateStats`: uma query só com `subscription_active`, `subscription_amount` para **total de lojas**, **assinaturas ativas** e **MRR estimado** no topo.
- `fetchShopsForAdminPage` + `ADMIN_SHOPS_PAGE_SIZE` (**30**), ordenação por nome, `.range`.
- `fetchShopsForAdmin` mantém compatibilidade paginando em ciclo internamente; comentário `@deprecated` a apontar para a abordagem nova.
- Botão **“Carregar mais estabelecimentos”** na tabela.
- `onRefreshAdminStats` após: toggle de assinatura, exclusão de loja, salvar rascunho financeiro (PATCH subscription).

---

## Referência rápida de constantes

| Onde | Constante / função |
|------|---------------------|
| Janela agenda parceiro | `PARTNER_APPOINTMENT_PAST_DAYS`, `PARTNER_APPOINTMENT_FUTURE_DAYS`, `partnerAgendaDateRange()` |
| Tamanho página pedidos parceiro | `PARTNER_ORDERS_RECENT_PAGE_SIZE` |
| Admin lista | `ADMIN_SHOPS_PAGE_SIZE` |
| Catálogo cliente | `SHOPS_SELECT_CLIENT_CATALOG` em `shops.ts` |

---

*Documento alinhado ao trabalho descrito em `docs/SUPABASE_EGRESS_E_ALTERACOES.md` e às otimizações adicionais acima.*

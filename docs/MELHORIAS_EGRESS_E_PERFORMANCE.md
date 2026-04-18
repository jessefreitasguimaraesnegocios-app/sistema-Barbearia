# Melhorias de egress e performance (parceiro, cliente, admin)

Resumo do que foi implementado para reduzir tráfego Supabase (PostgREST + Realtime), evitar refetches pesados e limitar volume de dados por pedido.

---

## 1. Pedidos da loja (parceiro) — Realtime sem lista inteira

**Arquivo:** `hooks/useRealtimePartnerOrders.ts`

- Antes: cada evento em `public.orders` disparava `fetchPartnerOrdersWithProfiles` (lista completa + `profiles` em batch).
- Agora: merge local (INSERT / UPDATE / DELETE), no mesmo espírito de `useRealtimeOrders` na área cliente.
- Perfil do cliente: reutiliza `clientDisplayName` / `clientAvatarUrl` já em memória quando o `client_id` é conhecido; caso contrário, um GET mínimo a `profiles` para essa linha.

---

## 2. Bundle da loja (parceiro) — Realtime granular

**Arquivos:** `hooks/useShop.ts`, `services/supabase/mapPartnerShop.ts`, `services/supabase/shops.ts`

- Antes: qualquer `postgres_changes` em `shops`, `services`, `professionals` ou `products` chamava `reloadShop()` → bundle completo (1 shop + 3 listas).
- Agora:
  - `shops` → `fetchPartnerShopRowOnly` + `mergePartnerShopScalarRow` (só metadados da loja).
  - `services` / `professionals` / `products` → só essa relação (`fetchPartnerServicesForShop`, `fetchPartnerProfessionalsForShop`, `fetchPartnerProductsForShop`).
- `mapPartnerShop.ts`: extraídos `mapPartnerServicesFromRows`, `mapPartnerProfessionalsFromRows`, `mapPartnerProductsFromRows` e `mergePartnerShopScalarRow`; `mapPartnerShopFromBundle` passa a usá-los internamente.

---

## 3. Agendamentos e pedidos parceiro — janela de datas e paginação de pedidos

**Arquivo:** `services/supabase/partnerShopActivity.ts`

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

**Arquivo:** `views/ShopDetails.tsx`

- Antes: cada evento em `products` refazia `select` de **todos** os produtos da loja.
- Agora: merge na lista `liveProducts` a partir do payload (INSERT/UPDATE/DELETE).

---

## 5. Catálogo público — lista leve + detalhe sob demanda

**Arquivo:** `services/supabase/shops.ts`

- **Home / lista:** `SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS` (só colunas de `shops`) + busca em lote de `professionals` (`PROFESSIONALS_SELECT_CLIENT_CATALOG_LIST` por chunks de `shop_id`) — evita embed PostgREST gigante por loja.
- **Detalhe da loja:** `fetchClientCatalogShopDetailById` carrega `services` e `products` em paralelo com `SERVICES_SELECT_CLIENT_CATALOG_DETAIL` / `PRODUCTS_SELECT_CLIENT_CATALOG_DETAIL`.
- Aliases `SHOPS_SELECT_CLIENT_CATALOG_LIST`, `SHOPS_SELECT_CLIENT_CATALOG_DETAIL` e `SHOPS_SELECT_CLIENT_CATALOG` apontam para o mesmo núcleo de colunas da loja; o ganho de egress vem da **separação** lista vs relacionamentos pesados.

---

## 6. Admin — estatísticas leves + lista paginada

**Arquivos:** `services/supabase/shops.ts`, `pages/AdminArea.tsx`, `views/AdminDashboard.tsx`

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
| Catálogo cliente (lista + selects de detalhe) | `SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS`, `PROFESSIONALS_SELECT_CLIENT_CATALOG_LIST`, `SERVICES_SELECT_CLIENT_CATALOG_DETAIL`, `PRODUCTS_SELECT_CLIENT_CATALOG_DETAIL` em `shops.ts` |

---

*Documento alinhado ao trabalho descrito em `docs/SUPABASE_EGRESS_E_ALTERACOES.md` e às otimizações adicionais acima.*

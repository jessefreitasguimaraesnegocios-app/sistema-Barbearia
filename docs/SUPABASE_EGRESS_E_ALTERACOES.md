# Resumo: egress no Supabase e alterações no projeto

Documento para quando você migrar para um plano com **mais quota de egress** (ou quiser **voltar a comportamentos de “máxima comodidade”** em troca de mais tráfego).

---

## O que aconteceu

- No **Supabase (plano Free)**, o painel de **Usage** mostrou **Egress acima do limite** (~7,7 GB / 5 GB no ciclo de faturação).
- **Egress** conta **toda a saída de rede** do projeto: respostas do **PostgREST** (os teus `.from().select()`), **Auth**, **Realtime**, **Storage** (imagens/arquivos), **Edge Functions**, etc. — não é só “SQL”.
- O **tamanho da base** e outras métricas estavam baixas; o gargalo era **volume de dados transferidos** (JSON grande, listas completas, refetch em cadeia, imagens, etc.).

---

## O que foi feito (por tema)

### 1. Menos dados por pedido ao Supabase (`select` explícito)

- **Objetivo:** cada resposta HTTP traz só colunas que a UI precisa → **menos bytes** por request.
- **Onde:**
  - `services/supabase/shops.ts` — `fetchPartnerShopBundle`: `services` e `products` deixaram de usar `select('*')` e passaram a constantes `SERVICES_SELECT_PARTNER_BUNDLE` e `PRODUCTS_SELECT_PARTNER_BUNDLE` (alinhadas com `mapPartnerShopFromBundle`).
  - Área do cliente — agendamentos e pedidos: selects explícitos (ver arquivos abaixo).

**Para “máxima simplicidade” com banco grande:** você pode voltar a `select('*')` onde quiser debug ou colunas dinâmicas; **não melhora performance do Postgres**, só **aumenta egress** e payload no browser.

---

### 2. Área do cliente: paginação + Realtime sem refetch de pedidos

**Arquivos principais:**

| Arquivo | Alteração |
|----------|-----------|
| `services/supabase/clientListQueries.ts` | `CLIENT_LIST_PAGE_SIZE` (20), `APPOINTMENTS_SELECT_CLIENT` (inclui `created_at` para ordenação estável), `sortAppointmentsClientList`. |
| `services/supabase/orderMapping.ts` | `ORDERS_SELECT_CLIENT`, `mapRowToOrder`, `sortOrdersNewestFirst`. |
| `hooks/useRealtimeOrders.ts` | **Novo:** merge local em `orders` (INSERT/UPDATE/DELETE) como já existia para agendamentos. |
| `pages/ClientArea.tsx` | Primeira página com `.range(0, N-1)`; “carregar mais” avança **offset só nesse fluxo** (não confundir com o tamanho da lista após Realtime); remove canal que fazia **refetch completo** de `orders` a cada evento; após pagamento no fluxo da loja, volta a carregar **só a primeira página** e repõe offsets. |
| `views/ClientAppointments.tsx` / `views/ClientOrders.tsx` | Botão **“Carregar mais…”** quando há mais páginas. |
| `types.ts` | `Order` ganhou `createdAtIso?: string` para ordenação e merge Realtime. |

**Comportamento anterior (mais egress em pedidos):** cada evento Realtime em `orders` disparava um **novo `select` da lista inteira**.

**Comportamento atual:** Realtime **atualiza a lista em memória**; só pedidos à API quando carregas mais páginas ou o refresh inicial / pós-pagamento.

**Para voltar à “melhor comodidade” com capacidade alta:**

1. Aumentar ou remover limite: em `clientListQueries.ts`, altere `CLIENT_LIST_PAGE_SIZE` (ex.: 50, 100) ou implemente “carregar tudo” num único request.
2. Remover paginação na UI: deixe de passar `hasMore` / `onLoadMore` e volte a um único `select(...).order(...)` **sem** `.range()`.
3. Se quiser **sempre** lista 100% sincronizada com o servidor a cada evento (não recomendado em escala), remova `useRealtimeOrders` e volte a inscrever o canal com `() => fetchOrders()` — **aumenta egress** de novo.

---

### 3. Agendamentos: Realtime já era merge (sem mudança de filosofia)

- `useRealtimeAppointments` já fazia merge local; mantém-se.
- A paginação **só limita o carregamento inicial + páginas seguintes**; o Realtime continua a inserir/atualizar/remover linhas na lista visível.

---

### 4. Catálogo público de lojas (contexto, pouco código alterado neste doc)

- O **maior peso** de egress pode continuar a vir do **catálogo** (muitas lojas + profissionais/serviços/produtos) + **Realtime** + **imagens** (Storage/CDN). A lista da home usa selects enxutos e relacionamentos fatiados — ver `SHOPS_SELECT_CLIENT_CATALOG_LIST_SCALARS` e `docs/MELHORIAS_EGRESS_E_PERFORMANCE.md`.
- O hook **`useClientCatalogShops`** já usa **localStorage** (`lib/clientCatalogCache`) para pintar rápido e sincronizar em background — isso **não** é TanStack Query; é cache próprio do catálogo.

### Atualização aplicada (lista leve + detalhe)

- A home do cliente agora usa payload leve:
  - `SHOPS_SELECT_CLIENT_CATALOG_LIST` (dados básicos + profissionais mínimos).
- O detalhe da loja (ao abrir `ShopDetails`) busca sob demanda:
  - `fetchClientCatalogShopDetailById` com `SHOPS_SELECT_CLIENT_CATALOG_DETAIL`.
- Guardrail operacional adotado:
  - **Listas públicas nunca devem embutir relações grandes** (`products/services`) quando a UI não precisa delas no primeiro paint.

---

### 5. TanStack Query — cache da primeira página + invalidação após pagamento

**Ideia (Supabase em linguagem simples):** “menos pedidos repetidos à rede” **sem** estragar fluxos em que o usuário **acabou de pagar** e precisa ver lista fresca.

| Arquivo | Função |
|----------|--------|
| `package.json` | Dependência `@tanstack/react-query`. |
| `contexts/AppQueryProvider.tsx` | `QueryClientProvider` + defaults (`refetchOnWindowFocus: false`, `staleTime` base 30s, `retry: 1`). |
| `App.tsx` | Envolves a app com `AppQueryProvider` (fora de `ThemeProvider` / `AuthProvider`). |
| `lib/clientAreaQueryKeys.ts` | Chaves estáveis: `appointmentsP1(clientId)`, `ordersP1(clientId)`. |
| `lib/clientAreaCacheConfig.ts` | `CLIENT_AREA_FIRST_PAGE_STALE_MS` (**25s**) — quanto tempo a **primeira página** pode servir-se do cache **sem** novo GET. |
| `services/supabase/fetchClientAreaFirstPages.ts` | `fetchClientAppointmentsFirstPage` / `fetchClientOrdersFirstPage` (mesma query que antes, centralizada). |
| `pages/ClientArea.tsx` | `fetchAppointmentsFirstPage` / `fetchOrdersFirstPage` passam a `queryClient.fetchQuery(...)` com `staleTime` acima. Após **pagamento** (`onBook` / `onOrder` / `onRefetchAppointmentsAndOrders`), chama-se **`invalidateQueries`** nessas chaves e de seguida **`fetchQuery`** — **rede obrigatoriamente fresca**, independentemente do stale. |

**Porque `staleTime` curto (25s)?** O **Realtime** continua a atualizar a lista em memória; um cache longo na primeira página podia, em casos raros, servir um snapshot antigo ao voltar à home **sem** invalidação. 25s equilibra **menos GET duplicados** ao navegar vs **frescura razoável**.

**O que ainda não está em TanStack Query:** “Carregar mais” (offset seguinte), catálogo (`useClientCatalogShops`), área parceiro — podem ser fases futuras.

---

### 5.1 Auth e egress (`/user`)

- `refreshProfile` em `AuthContext` passou a usar `auth.getSession()` em vez de `auth.getUser()` para evitar request Auth extra em refresh comum.
- Fluxos de login parceiro/cliente mantêm `refreshProfile` sem await bloqueante, deixando o listener global concluir hidratação.
- Guardrail operacional adotado:
  - **Evitar `getUser()` no front para refresh rotineiro**; preferir sessão em memória/storage (`getSession`) e um único ponto central de hidratação.

---

### 6. Avisos do Tailwind (Problems no editor)

- Ajustes de sintaxe canónica (v4), ex.: `text-[var(--app-text)]` → `text-(--app-text)`, `dark:[color-scheme:dark]` → `dark:scheme-dark`, etc.
- **Não alteram** egress nem Supabase; são só **lint / consistência de classes**.

Arquivos tocados nessa limpeza (memória útil): `components/Layout.tsx`, `LoginForm.tsx`, `ThemeLogoButton.tsx`, `views/ShopCustomization.tsx`.

---

## Checklist rápido “quando tiver mais capacidade”

- [ ] Subir `CLIENT_LIST_PAGE_SIZE` ou remover `.range()` e “Carregar mais”.
- [ ] Manter `select` explícito (boa prática mesmo com plano pago) ou relaxar para `*` só onde fizer sentido operacional.
- [ ] Manter **merge Realtime** em `orders` (costuma ser win em qualquer plano); só voltar a refetch total se tiveres um motivo forte.
- [ ] Rever **imagens** (CDN, cache HTTP, tamanhos) — costuma ser o maior egress fora do JSON.
- [ ] Aumentar `CLIENT_AREA_FIRST_PAGE_STALE_MS` só se aceitar menos pedidos à rede e possível desfasagem rara vs Realtime; após pagamento a invalidação continua a mandar na rede.
- [ ] Revisar logs Auth (`/user`, `/token`) por referer/IP e garantir que não há loops de sessão em telas que montam headers de API.

---

## Como voltar ao comportamento anterior (rollback guiado)

Se um dia quiser voltar para o fluxo “mais simples / mais tráfego”, use esta ordem:

| Arquivo | Mudança feita | Como desfazer |
|---------|---------------|---------------|
| `services/supabase/shops.ts` | Catálogo dividido em `SHOPS_SELECT_CLIENT_CATALOG_LIST` (home) e `SHOPS_SELECT_CLIENT_CATALOG_DETAIL` (detalhe), com `fetchClientCatalogShopDetailById` | Voltar `fetchClientCatalogPage`, `fetchClientCatalogUpdatedSince` e `fetchClientCatalogByShopIds` para `SHOPS_SELECT_CLIENT_CATALOG` completo (com `services+products`), e remover o fetch de detalhe sob demanda |
| `pages/ClientArea.tsx` | Home usa lista leve; ao clicar loja busca detalhe completo por id; merge preserva serviços/produtos detalhados | Remover `handleSelectShop` com `fetchClientCatalogShopDetailById`, voltar `onSelectShop` direto para trocar de view, e simplificar efeito de `setSelectedShop` sem lógica de preservação |
| `hooks/useClientCatalogShops.ts` | Realtime da home deixou de subscrever `services` e `products` para cortar tráfego | Reativar listeners `.on(... table: 'services')` e `.on(... table: 'products')` se quiser atualização imediata total no catálogo da home |
| `contexts/AuthContext.tsx` | `refreshProfile` trocado de `auth.getUser()` para `auth.getSession()` (menos `/user`) | Voltar para `auth.getUser()` em `refreshProfile` se preferires validação remota por chamada (mais Auth egress) |
| `pages/PartnerArea.tsx` | Login parceiro usa `void refreshProfile()` (não bloqueante) | Voltar para `await refreshProfile()` no submit de login |
| `docs/EGRESS_24H_BASELINE_CHECK.md` | Checklist de medição antes/depois | Manter como modelo de baseline; ver também **[docs/README.md](./README.md)** |

### Efeito esperado ao desfazer

- **Mais simplicidade operacional**, porém:
  - payload maior no catálogo cliente,
  - mais eventos Realtime na home,
  - maior frequência de chamadas Auth `/user`,
  - tendência de subida de egress no plano Free.

### Rollback técnico (git)

Se quiser desfazer só este pacote, use o commit hash correspondente e reverta:

`git revert <hash_do_commit_das_otimizacoes_de_egress>`

Se quiser desfazer de forma seletiva por arquivo, faça rollback apenas nos caminhos acima.

---

## Referência de constantes (onde mudar primeiro)

- Tamanho da página cliente: `services/supabase/clientListQueries.ts` → `CLIENT_LIST_PAGE_SIZE`
- Colunas pedidos cliente: `services/supabase/orderMapping.ts` → `ORDERS_SELECT_CLIENT`
- Colunas agendamentos cliente: `services/supabase/clientListQueries.ts` → `APPOINTMENTS_SELECT_CLIENT`
- Bundle parceiro serviços/produtos: `services/supabase/shops.ts` → `SERVICES_SELECT_PARTNER_BUNDLE`, `PRODUCTS_SELECT_PARTNER_BUNDLE`
- Stale da primeira página (TanStack): `lib/clientAreaCacheConfig.ts` → `CLIENT_AREA_FIRST_PAGE_STALE_MS`
- Chaves de invalidação: `lib/clientAreaQueryKeys.ts` → `appointmentsP1` / `ordersP1`

---

*Última atualização: inclui TanStack Query (primeira página cliente + invalidação pós-pagamento), além de paginação / Realtime / egress.*

# Medição 24h de egress (antes/depois)

Objetivo: comparar o impacto das otimizações por tipo de tráfego no Supabase.

## 1) Coleta "antes" (baseline)

- Janela: 24 horas completas.
- Fonte: Supabase Dashboard → Usage → Egress.
- Registrar:
  - Auth Egress (GB/MB)
  - PostgREST Egress (GB/MB)
  - Realtime Egress (GB/MB)
  - Functions Egress (GB/MB)
  - Total Egress no período

## 2) Coleta "depois" (24h após deploy)

- Mesma janela (24h) e mesmo ambiente (production).
- Registrar os mesmos campos.

## 3) Comparação

Use a tabela:

| Tipo | Antes | Depois | Delta absoluto | Delta % |
|------|------:|-------:|---------------:|--------:|
| Auth |       |        |                |         |
| PostgREST |  |        |                |         |
| Realtime |   |        |                |         |
| Functions |  |        |                |         |
| Total |      |        |                |         |

Fórmula de delta percentual:

`((depois - antes) / max(antes, 0.0001)) * 100`

## 4) Critério de sucesso (este projeto)

- PostgREST: queda perceptível após lista leve + detalhe sob demanda.
- Auth: menos ocorrências de `/user` em picos, sem regressão de login.
- UX: home do cliente e detalhe da loja continuam sem regressão funcional.

## 5) Evidências mínimas para auditoria interna

- Screenshot de Usage (antes/depois).
- Screenshot de Auth logs filtrando `/user` no mesmo intervalo.
- Hash do commit deployado.

Contexto das mudanças no código: **[SUPABASE_EGRESS_E_ALTERACOES.md](./SUPABASE_EGRESS_E_ALTERACOES.md)**.

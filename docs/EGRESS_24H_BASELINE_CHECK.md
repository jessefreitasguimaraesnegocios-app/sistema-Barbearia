# Medicao 24h de egress (antes/depois)

Objetivo: comparar impacto das otimizacoes por tipo de trafego no Supabase.

## 1) Coleta "antes" (baseline)

- Janela: 24h completas.
- Fonte: Supabase Dashboard > Usage > Egress.
- Registrar:
  - Auth Egress (GB/MB)
  - PostgREST Egress (GB/MB)
  - Realtime Egress (GB/MB)
  - Functions Egress (GB/MB)
  - Total Egress no periodo

## 2) Coleta "depois" (24h apos deploy)

- Mesma janela (24h) e mesmo ambiente (production).
- Registrar os mesmos campos.

## 3) Comparacao

Use a tabela:

| Tipo | Antes | Depois | Delta absoluto | Delta % |
|------|------:|-------:|---------------:|--------:|
| Auth |       |        |                |         |
| PostgREST |  |        |                |         |
| Realtime |   |        |                |         |
| Functions |  |        |                |         |
| Total |      |        |                |         |

Formula de delta percentual:

`((depois - antes) / max(antes, 0.0001)) * 100`

## 4) Criterio de sucesso (este projeto)

- PostgREST: queda perceptivel apos lista leve + detalhe sob demanda.
- Auth: menos ocorrencias de `/user` em picos, sem regressao de login.
- UX: home cliente e detalhe da loja continuam sem regressao funcional.

## 5) Evidencias minimas para auditoria interna

- Screenshot de Usage (antes/depois).
- Screenshot de Auth logs filtrando `/user` no mesmo intervalo.
- Hash do commit deployado.

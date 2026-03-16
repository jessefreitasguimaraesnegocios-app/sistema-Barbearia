-- Passo 4: Atualizar asaas_api_key da loja Barbearia D_K
--
-- COMO OBTER A CHAVE NO ASAAS:
-- 1. Acesse o painel Asaas (conta principal).
-- 2. Menu: Integrações → Chaves de API.
-- 3. Se aparecer "Gerenciamento de Chaves de API de Subcontas", entre ali e selecione
--    a subconta (Bianca / dk@gmail.com) para criar/listar chaves.
--    OU na própria subconta: entre em Parceiros → Subcontas → [sua subconta] e veja
--    se há link para Chaves de API / Integrações da subconta.
-- 4. Crie uma nova chave (nome ex.: "BeautyHub App") e copie o valor (só é exibido uma vez).
-- 5. Substitua abaixo 'COLE_A_CHAVE_DA_SUBCONTA_AQUI' pela chave copiada.
-- 6. Rode este script no Supabase → SQL Editor.

UPDATE public.shops
SET asaas_api_key = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjFjOWNkOGEzLTA2NDUtNDk0MC1hYzViLWVmMzk3ZTc2YjU1Zjo6JGFhY2hfYTcxNjE4NzQtM2ExOS00N2Q4LTk3YzUtNjU3MWYxNmYxMjdm
'
WHERE email = 'dk@gmail.com';

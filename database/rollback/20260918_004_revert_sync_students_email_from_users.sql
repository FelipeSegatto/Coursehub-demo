-- Não restaura o e-mail divergente. users.email é a fonte da
-- autenticação; reaplicar o typo no perfil seria pior que deixar
-- o sync. Este arquivo existe só para o par migration/rollback
-- ficar completo.
SELECT 1;

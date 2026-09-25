# Reset automático da demo

Com `DEMO_RESET_ON_LOGOUT=true`, o banco ativo (`DB_NAME`) volta ao snapshot
(`DEMO_SNAPSHOT_DB`) uma hora depois do último token de login.

Cada login bem-sucedido empurra esse prazo para uma hora à frente. Se duas
pessoas entram ao mesmo tempo, vale o token mais recente. Sair da conta não
restaura o banco.

A cópia devolve ao estado inicial, entre outros:

- faturas/mensalidades e pagamentos PIX;
- notificações e estado lida/não lida;
- atividades, respostas e notas;
- presença/chamadas;
- conversas e mensagens;
- alterações administrativas feitas durante a demonstração.

A cópia é feita dentro de uma transação. Um reset já em andamento não dispara
outro em paralelo. Se o processo da API reiniciar antes da hora, o prazo
pendente é retomado.

## Configuração

```env
DEMO_RESET_ON_LOGOUT=true
DEMO_SNAPSHOT_DB=coursehub_escola_jornada
```

Por padrão o reset usa `DB_USER`/`DB_PASSWORD`. Esse usuário já precisa escrever
em `DB_NAME` e também precisa de `SELECT` no schema de snapshot.

Para conceder somente esse acesso de leitura ao snapshot, execute uma vez:

```powershell
$env:MYSQL_ROOT_PASSWORD="SUA_SENHA_ROOT"
npm run demo:reset-permissions
```

Se preferir uma credencial separada para a restauração:

```env
DEMO_RESET_DB_USER=usuario_reset
DEMO_RESET_DB_PASSWORD=senha
```

## Snapshot inicial

O snapshot deve representar exatamente a jornada que você quer que reapareça
após cada reset. Para atualizá-lo deliberadamente:

```powershell
$env:MYSQL_ROOT_PASSWORD="SUA_SENHA_ROOT"
npm run demo:snapshot
```

Não faça um novo snapshot depois de testar pagamentos/notificações, a menos que
essas mudanças devam fazer parte do novo estado inicial.

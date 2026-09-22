# Demo do CourseHub

Roteiro e contas da jornada. O app e o `.env` continuam em `coursehub_escola`. A cópia `coursehub_escola_jornada` é o ponto de restauração — o backend não aponta para ela.

## Bancos

| Schema | Papel |
|---|---|
| `coursehub_escola` | Base viva da apresentação |
| `coursehub_escola_jornada` | Snapshot da jornada recortada |
| `coursehub_demo` | Mini schema isolado do `setupDemo.js` — **não** é esta demo |

Depois do Pix do Pedro, de envios ou de chamadas, restaure a jornada a partir do snapshot. Não recorte de novo no meio da apresentação: o `shapeEscolaDemo.js` apaga e recria os envios das atividades da jornada.

## Recortar (escola viva)

No `coursehub-project/backend`:

```powershell
$env:MYSQL_ROOT_PASSWORD="..."
node scripts/demo/shapeEscolaDemo.js
```

Não mexe em `admin@coursehub.com`.

## Snapshot e restore

```powershell
$env:MYSQL_ROOT_PASSWORD="..."
node scripts/demo/snapshotEscolaDemo.js
```

```powershell
$env:MYSQL_ROOT_PASSWORD="..."
$env:DEMO_RESTORE="1"
node scripts/demo/snapshotEscolaDemo.js --restore
```

O restore sobrescreve `coursehub_escola`. Uploads em disco (`backend/storage/uploads`) não entram na cópia MySQL.

Gateway simulado: fora de `NODE_ENV=test`, PIX/boleto geram QR e auto-aprovam em ~5s (`SIMULATED_PAYMENT_AUTO_APPROVE` no `.env.example`). Reinicie o backend quando for testar o Pix.

## Contas

Senha das cinco: `CourseHub.Demo.2026`

| Papel | Nome | E-mail |
|---|---|---|
| Admin | Larissa Almeida | `admin2@coursehub.com` |
| Professor da turma | Marcelo Torres | `marcelo.torres@email.com` |
| Professor de dois cursos | Junior Galdino | `junior.galdino@email.com` |
| Aluna em dia | Marina Alves | `marina.alves@email.com` |
| Aluno com atraso | Pedro Nogueira | `pedro.nogueira@email.com` |

- Marina: só **Introdução ao Node.js e Express**, Turma B. 3 atividades e 1 avaliação já feitas/corrigidas; a 4ª é o quiz rápido da semana (ela ainda não enviou). Contrato à vista pago.
- Pedro: o mesmo Node + **React do Zero**, Turma B. Uma falta no Node. Plano mensal 4x; parcela 2 atrasada. React também tem o quiz da semana aberto.
- Turmas B com pelo menos 10 alunos. Colegas já enviaram a 4ª atividade (`pending_review`) para correção.
- Junior Galdino é titular das turmas da Marina e do Pedro (Node B e React B) e das Turmas C dos dois cursos.
- Marcelo Torres permanece titular da Node Turma A.
- Semestre 2026.2 (20/08–19/11): vídeos, apostila, 10 atividades, projeto (upload), 2 avaliações, 14 encontros.

Quando o aluno não tem envio aberto, a home mostra o bloco verde **Tudo em dia** / “Nenhuma atividade esperando envio…”. Na jornada, Marina e Pedro ainda têm práticas futuras, então esse vazio não aparece até elas serem feitas.

## Roteiro

No login o painel abre sozinho; depois fica o botão **Roteiro da demo**. Pode fechar e explorar.

1. Público — home, catálogo, sobre, contato, termos.
2. Marina — home, player, quiz rápido da semana, documentos, chat da turma.
3. Pedro — chat, React, financeiro: **Pagar com Pix** → QR → aprovação automática → o card de atraso vira a próxima parcela / banner em dia. A secretaria (Larissa) recebe notificação de pagamento.
4. Marcelo — fila da 4ª atividade, chamada da Turma A.
5. Junior — turmas da Marina e do Pedro (Node B e React B) + Turmas C; gráfico de presença; Materiais com seletor de curso; chamada; chat da aluna.
6. Larissa — contrato da Marina, emitir matrícula e frequência (ago–nov/2026), conferir o PDF; depois do Pix, a notificação de pagamento recebido.

Evite apagar curso, cancelar contrato pago ou trancar matrícula.

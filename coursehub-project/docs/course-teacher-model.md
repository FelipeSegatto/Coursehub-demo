# Modelo curso ↔ professor

## Modelo atual

Um curso pode ter **múltiplos professores** vinculados. A relação
oficial é N:N, na tabela `course_teachers`:

```sql
course_teachers (
  course_id INT,
  teacher_id INT,
  status ENUM('active', 'inactive'),
  created_at, updated_at
)
```

- Vínculo removido → `status = 'inactive'` (nunca `DELETE` — o
  histórico de quem já foi professor de um curso é preservado).
- Vínculo readicionado → volta para `'active'` em vez de duplicar
  linha (`PRIMARY KEY (course_id, teacher_id)` garante isso).
- Todo código novo de membership/autorização de curso deve passar por
  `backend/services/courses/courseTeacherService.js` — nunca duplicar
  SQL de `course_teachers` em outro arquivo.

### `courses.teacher_id` — campo legado/futuro

`courses.teacher_id` **permanece no schema**, mas não é a fonte de
membership desde esta versão. Ele existe para:

- compatibilidade com código/respostas de API que ainda o leem
  (`teacher_id`, `teacher_name`);
- estrutura pronta para um possível **professor principal /
  coordenador de curso / chefe de departamento** no futuro.

## Regra desta versão

**Nenhuma regra de negócio ativa depende de `courses.teacher_id` como
"principal".** Não existe frontend para configurá-lo como tal. Todos
os professores com vínculo `active` em `course_teachers` têm
membership equivalente no nível do curso — nenhum é mais "dono" do
curso do que outro.

`courses.teacher_id` nunca é derivado automaticamente de
`course_teachers` (e vice-versa) por nenhuma regra de "principal" —
isso foi deliberadamente deixado fora do escopo desta versão. As duas
únicas formas como os dois podem ficar consistentes hoje são:

1. **Legado explícito**: se algum chamador ainda escreve
   `courses.teacher_id` diretamente (payload com `teacher_id` mas sem
   `teacherIds`), esse valor fica exatamente como enviado — o backend
   não sincroniza `course_teachers` a partir dele automaticamente.
2. **Reconciliação de leitura**: `courseTeacherService.listCourseTeachers(runner, courseId, { reconcileLegacy: true })`
   — usada por `adminCourseService.getCourseById` — verifica se
   `courses.teacher_id` já tem uma linha ativa correspondente em
   `course_teachers` e, se não tiver, cria/reativa essa linha (nunca
   concede status de "principal", só garante que o vínculo simples
   exista). É por isso que abrir a tela de edição de um curso legado
   (nunca editado pelo fluxo novo) já basta para convergir esse curso
   para `course_teachers`.

Checagens de autorização de alta frequência (`isTeacherAssignedToCourse`,
usada por atividades/conteúdos/calendário) tratam
`courses.teacher_id` como vínculo elegível **sem escrever no banco**
(uma consulta `UNION`, não uma reconciliação) — isso evita transformar
toda checagem de acesso numa escrita.

## Turmas

`classes.teacher_id` continua representando **um único professor
responsável pela turma** no cadastro administrativo — não virou N:N
(`class_teachers` não foi criado).

Co-professor com `course_teachers` ativo **opera** as turmas daquele
curso: frequência, encontros, correção e listagens. A checagem central
é `classAccessService.getClassOwnedByTeacher` /
`teacherClassAccessSql`. Membership no curso não transfere o campo
`classes.teacher_id`; só o acesso operacional.

O professor *cadastrado* como responsável da turma ainda precisa estar
vinculado ao curso (`assertTeacherAssignedToCourse` em
`adminClassService` create/update).

## O que NÃO foi implementado nesta versão

- `class_teachers` / dois professores responsáveis pela mesma turma.
- Professor principal/coordenador no frontend, ou qualquer
  comportamento privilegiado baseado em `courses.teacher_id`.
- Fanout de **chat** para todos os professores de um curso
  (`chatTeacherSupportService.getActiveResponsibleTeacher` ainda
  resolve um responsável). Notificação de envio
  (`learning.submission.received`) passa a todos os
  `course_teachers` ativos.
- `access_until` / acesso proporcional ao período pago.
- Remoção de `courses.teacher_id`.

## Futuro

Evoluções possíveis, nenhuma implementada agora:

- `courses.teacher_id` → `primary_teacher_id` / `coordinator_id`
  explícito, com regra de negócio real (ex.: só o coordenador pode
  arquivar o curso).
- `class_teachers`, se houver necessidade concreta de co-docência na
  mesma turma.
- Fanout de notificação/chat para todos os professores de um curso.

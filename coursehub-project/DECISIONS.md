# Decisões de arquitetura e produto

Registro curto de decisões que não são óbvias a partir do código sozinho —
o quê foi decidido, por quê, e o que foi descartado. Não é changelog (isso é
o `git log`) nem documentação de uso — é o motivo por trás de escolhas que
alguém poderia querer reverter ou repetir sem entender o contexto.

Formato de cada entrada: data, decisão, motivo, alternativa descartada.

---

## 2026-08-29 — Remoção da troca de papel (role) de usuário no admin

**Decisão:** removida a opção "Alterar papel" do `UsersAdmin.jsx` (menu de
ações da listagem de usuários), junto com o endpoint que a suportava
(`PATCH /api/admin/users/:userId/role`, serviço `updateUserRole`).

**Motivo:** a funcionalidade estava completamente inoperante para qualquer
conta real do sistema, não apenas arriscada. O backend
(`adminUserService.js`) bloqueava incondicionalmente qualquer conversão para
`teacher`/`student` (sempre 409), e bloqueava conversão para `admin` sempre
que a conta já tivesse `student_id`/`teacher_id` vinculado — o que é o caso
de todo aluno/professor legítimo. Na prática, o único caminho que o backend
aceitaria (uma conta sem vínculo acadêmico/profissional virando `admin`) só
existe para contas já inconsistentes no banco; para qualquer usuário normal,
clicar em "Alterar papel" abria um modal cujo botão de confirmar nunca
conseguia ter sucesso.

Suportar troca de papel de verdade exigiria criar/migrar o cadastro
acadêmico ou profissional vinculado (linhas em `students`/`teachers`,
matrículas, contratos financeiros, etc.) — isso é uma feature nova e de
alto risco, não uma correção pontual do fluxo existente.

**Alternativa descartada:** implementar a conversão completa (criar o
cadastro vinculado ao trocar para `teacher`/`student`, permitir trocar para
`admin` mesmo com vínculo existente). Descartada por estar fora do escopo
de uma correção e por já existir um caminho alternativo — cadastrar um novo
usuário diretamente com o papel desejado.

**Como aplicar:** se a necessidade real por trás disso reaparecer
(ex.: "promover um professor a admin"), tratar como feature nova, com
planejamento próprio de migração de dados — não reintroduzir a troca de
papel isolada sem esse fluxo.

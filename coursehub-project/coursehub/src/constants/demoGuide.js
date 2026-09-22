export const DEMO_PASSWORD = "CourseHub.Demo.2026";

export const DEMO_ACCOUNTS = [
  {
    id: "student-a",
    role: "Aluna em dia",
    name: "Marina Alves",
    email: "marina.alves@email.com",
    summary:
      "É a aluna adimplente: um curso (Node, Turma B), contrato pago, progresso no ar. Já entregou 3 atividades e 1 prova. Na home ainda tem o quiz da semana — dá para ver aula, envio, documentos e o chat da turma.",
  },
  {
    id: "student-b",
    role: "Aluno com atraso",
    name: "Pedro Nogueira",
    email: "pedro.nogueira@email.com",
    summary:
      "É o aluno com vida acadêmica e financeira juntas: Node e React, uma falta, mensalidade 2/4 vencida. No Financeiro o card vermelho é o Pix — QR, aprovação em segundos e a escola recebe o aviso.",
  },
  {
    id: "teacher",
    role: "Professor da turma",
    name: "Marcelo Torres",
    email: "marcelo.torres@email.com",
    summary:
      "É o dia a dia docente no Node: titular da Turma A, fila de correção da 4ª atividade (colegas já enviaram; Marina e Pedro ainda não) e a chamada da turma.",
  },
  {
    id: "teacher-multi",
    role: "Professor de dois cursos",
    name: "Junior Galdino",
    email: "junior.galdino@email.com",
    summary:
      "É o professor da Marina e do Pedro: Node Turma B e React Turma B, além das Turmas C dos dois cursos. Na home o gráfico de presença traz as turmas; em Materiais o seletor troca o curso; o chat da aluna cai aqui.",
  },
  {
    id: "admin",
    role: "Secretaria da escola",
    name: "Larissa Almeida",
    email: "admin2@coursehub.com",
    summary:
      "É a operação: contrato pago da Marina, emitir matrícula e frequência, acompanhar a escola. Depois do Pix do Pedro, a notificação de pagamento recebido aparece aqui.",
  },
];

export const DEMO_STEPS = [
  {
    title: "Público",
    detail:
      "Quem chega sem login: home, catálogo (Node e React), Sobre, Fale conosco, termos e rodapé.",
  },
  {
    title: "Marina",
    detail:
      "Área da aluna em dia: home com o que falta → player → quiz da semana → documentos acadêmicos → chat da turma.",
  },
  {
    title: "Pedro",
    detail:
      "Área do aluno com pendência financeira: chat, React e o quiz. No Financeiro, pague a fatura atrasada com Pix — o QR aparece e a aprovação chega em alguns segundos.",
  },
  {
    title: "Marcelo",
    detail:
      "Área do professor de Node: fila da 4ª atividade na home e chamada da Turma A.",
  },
  {
    title: "Junior",
    detail:
      "Professor da Marina e do Pedro: Turmas B de Node e React, mais as Turmas C. Home com o gráfico, Materiais (troque o curso), chamada e o chat da aluna.",
  },
  {
    title: "Larissa",
    detail:
      "Área da secretaria: contrato da Marina, emitir matrícula e frequência. Depois do Pix, abra as notificações — pagamento recebido.",
  },
];

export const DEMO_EXPLORE_NOTE =
  "O resto da plataforma é livre. Só não apague curso, não cancele contrato pago e não tranque matrícula: isso quebra a história da demo, não o sistema.";

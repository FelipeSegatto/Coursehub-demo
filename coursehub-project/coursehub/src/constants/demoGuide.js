export const DEMO_PASSWORD = "CourseHub.Demo.2026";

export const DEMO_ACCOUNTS = [
  {
    id: "student-a",
    role: "Aluna em dia",
    name: "Marina Alves",
    email: "marina.alves@email.com",
    moment: "Quiz da semana",
    summary:
      "É a aluna adimplente: um curso (Node, Turma B), contrato pago, progresso no ar. Já entregou 3 atividades e 1 prova. Na home ainda tem o quiz da semana — dá para ver aula, envio, documentos e o chat da turma.",
  },
  {
    id: "student-b",
    role: "Aluno com atraso",
    name: "Pedro Nogueira",
    email: "pedro.nogueira@email.com",
    moment: "Pagar com Pix",
    summary:
      "É o aluno com vida acadêmica e financeira juntas: Node e React, uma falta, mensalidade 2/4 vencida. No React ainda faltam a atividade final e a avaliação final. No Financeiro o card vermelho é o Pix — QR, aprovação em segundos e a escola recebe o aviso.",
  },
  {
    id: "teacher",
    role: "Professor da turma",
    name: "Junior Galdino",
    email: "junior.galdino@email.com",
    moment: "Duas turmas",
    summary:
      "É o professor da Marina e do Pedro: Node Turma B e React Turma B, além das Turmas C dos dois cursos. Na home a fila da 4ª atividade e o gráfico de presença; em Materiais o seletor troca o curso; o chat da aluna cai aqui. Depois que o Pedro entregar a atividade final e a avaliação final de React, a correção dessas duas peças o deixa elegível ao certificado.",
  },
  {
    id: "admin",
    role: "Secretaria da escola",
    name: "Larissa Almeida",
    email: "admin2@coursehub.com",
    moment: "Pagamento recebido",
    summary:
      "É a operação: contrato pago da Marina, emitir matrícula e frequência, acompanhar a escola. Depois do Pix do Pedro, a notificação de pagamento recebido aparece aqui. Quando o Junior tiver corrigido a atividade final e a avaliação final de React, ela emite o certificado de conclusão do Pedro.",
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
      "Área do aluno com pendência financeira: chat, React, a atividade final e a avaliação final. No Financeiro, pague a fatura atrasada com Pix — o QR aparece e a aprovação chega em alguns segundos.",
  },
  {
    title: "Junior",
    detail:
      "Área do professor da Marina e do Pedro: fila da 4ª atividade, gráfico de presença, Materiais (troque o curso), chamada e o chat da aluna. Quando o Pedro tiver enviado a atividade final e a avaliação final de React, corrija os dois: a partir daí ele fica elegível ao certificado de conclusão.",
  },
  {
    title: "Larissa",
    detail:
      "Área da secretaria: contrato da Marina, emitir matrícula e frequência. Depois do Pix, abra as notificações — pagamento recebido. Com a atividade final e a avaliação final de React do Pedro já corrigidas pelo Junior, emita o certificado de conclusão dele.",
  },
];

export const DEMO_EXPLORE_NOTE =
  "O resto da plataforma é livre. Só não apague curso, não cancele contrato pago e não tranque matrícula: isso quebra a história da demo, não o sistema.";

/**
 * Recorte acadêmico/financeiro da jornada demo em coursehub_escola.
 * Chamado de dentro de shapeEscolaDemo.js (mesma transação).
 */
const NODE_COURSE_ID = 5;
const REACT_COURSE_ID = 1;
const NODE_CLASS_ID = 12;
const REACT_CLASS_ID = 8;
const MONTHLY_AMOUNT = 322.5;
const MONTHLY_COUNT = 4;

const NODE_CURRICULUM = [
  {
    key: "n1",
    kind: "activity",
    type: "quiz",
    title: "Quiz: npm, scripts e o package.json",
    description: "Confira se o básico do projeto Node está sólido antes de subir o servidor.",
    dueDate: "2026-08-29 23:59:00",
    orderIndex: 1,
    questions: [
      mc(
        "Para que serve o arquivo package.json num projeto Node?",
        [
          "Descrever dependências, scripts e metadados do projeto",
          "Guardar as variáveis de ambiente da produção",
          "Compilar TypeScript automaticamente",
          "Substituir o arquivo .gitignore",
        ],
        0
      ),
      mc(
        "Qual comando instala as dependências listadas no package.json?",
        ["npm install", "node start", "git clone", "npx create"],
        0
      ),
    ],
  },
  {
    key: "n2",
    kind: "activity",
    type: "quiz",
    title: "Quiz: métodos HTTP e status codes",
    description: "Escolha o método e o código certos para uma API REST simples.",
    dueDate: "2026-09-05 23:59:00",
    orderIndex: 2,
    questions: [
      mc(
        "Qual método HTTP é o mais adequado para criar um recurso novo?",
        ["GET", "POST", "PUT", "DELETE"],
        1
      ),
      mc(
        "Um POST bem-sucedido que criou o recurso costuma responder com:",
        ["200 OK", "201 Created", "204 No Content", "301 Moved Permanently"],
        1
      ),
    ],
  },
  {
    key: "n3",
    kind: "activity",
    type: "text",
    title: "Exercício: rotas e middleware no Express",
    description: "Resposta curta. Explique o papel do middleware com um exemplo do dia a dia da API.",
    dueDate: "2026-09-12 23:59:00",
    orderIndex: 3,
    questions: [
      text(
        "Em poucas frases, explique o papel de um middleware no Express e cite um exemplo do cotidiano da API."
      ),
    ],
  },
  {
    key: "n4",
    kind: "activity",
    type: "quiz",
    title: "Quiz rápido: req, res e a primeira rota",
    description: "Atividade curta de múltipla escolha da semana. Dá para fazer em poucos minutos.",
    dueDate: "2026-09-24 23:59:00",
    orderIndex: 4,
    questions: [
      mc(
        "No Express, o objeto req representa:",
        [
          "A requisição que chegou no servidor",
          "A conexão com o banco de dados",
          "O arquivo package.json",
          "O processo do Node em segundo plano",
        ],
        0
      ),
      mc(
        "res.json({ ok: true }) faz o quê?",
        [
          "Envia uma resposta HTTP em JSON",
          "Grava um log no terminal e encerra o Node",
          "Cria uma tabela no MySQL",
          "Redireciona o usuário para a home",
        ],
        0
      ),
      mc(
        "Qual destas é uma rota válida no Express?",
        [
          "app.get('/alunos', handler)",
          "SELECT * FROM alunos",
          "npm run alunos",
          "git checkout alunos",
        ],
        0
      ),
    ],
  },
  {
    key: "n5",
    kind: "activity",
    type: "quiz",
    title: "Quiz: parâmetros de rota e query string",
    description: "Diferença entre /alunos/:id e ?page=2 na prática.",
    dueDate: "2026-10-03 23:59:00",
    orderIndex: 5,
    questions: [
      mc(
        "Em app.get('/alunos/:id'), o id chega em:",
        ["req.params.id", "req.query.id", "req.body.id", "req.headers.id"],
        0
      ),
      mc(
        "A URL /alunos?page=2 coloca page em:",
        ["req.query", "req.params", "req.cookies", "req.route"],
        0
      ),
    ],
  },
  {
    key: "n6",
    kind: "activity",
    type: "text",
    title: "Texto: o ciclo de uma request",
    description: "Descreva o caminho de uma chamada até a resposta JSON.",
    dueDate: "2026-10-10 23:59:00",
    orderIndex: 6,
    questions: [
      text(
        "Descreva, em 4 a 8 linhas, o caminho de uma request GET /recados até o res.json(): cliente, rota, middleware, consulta e resposta."
      ),
    ],
  },
  {
    key: "n7",
    kind: "activity",
    type: "quiz",
    title: "Quiz: JSON e o body parser",
    description: "Como o Express lê o corpo de um POST.",
    dueDate: "2026-10-17 23:59:00",
    orderIndex: 7,
    questions: [
      mc(
        "Para ler JSON no corpo de um POST, o Express normalmente usa:",
        ["express.json()", "express.static()", "cors()", "helmet()"],
        0
      ),
      mc(
        "O payload JSON de um POST chega em:",
        ["req.body", "req.params", "req.query", "res.locals"],
        0
      ),
    ],
  },
  {
    key: "n8",
    kind: "activity",
    type: "quiz",
    title: "Quiz: erros 4xx e 5xx",
    description: "Separe erro do cliente de falha do servidor.",
    dueDate: "2026-10-24 23:59:00",
    orderIndex: 8,
    questions: [
      mc(
        "Um id inexistente em GET /alunos/999 deve responder:",
        ["404 Not Found", "500 Internal Server Error", "201 Created", "204 No Content"],
        0
      ),
      mc(
        "Um throw não tratado no meio da rota costuma virar:",
        ["500", "400", "401", "301"],
        0
      ),
    ],
  },
  {
    key: "n9",
    kind: "activity",
    type: "text",
    title: "Texto: pastas de uma API Express",
    description: "Proponha uma organização simples de arquivos para o projeto da turma.",
    dueDate: "2026-10-31 23:59:00",
    orderIndex: 9,
    questions: [
      text(
        "Proponha uma organização de pastas (routes, controllers, services, db) para a API de recados e justifique em poucas linhas."
      ),
    ],
  },
  {
    key: "n10",
    kind: "activity",
    type: "upload",
    title: "Projeto: API de recados",
    description: "Entregue o código ou um PDF com o recorte da API (CRUD de recados, Express e MySQL).",
    dueDate: "2026-11-07 23:59:00",
    orderIndex: 10,
    questions: [upload("Envie o arquivo do projeto (zip, pdf ou doc).")],
  },
  {
    key: "ne1",
    kind: "exam",
    type: "quiz",
    title: "Avaliação parcial — Express na prática",
    description: "Prova objetiva da primeira metade do semestre: rotas, HTTP e middleware.",
    dueDate: "2026-09-16 23:59:00",
    orderIndex: 11,
    questions: [
      mc(
        "app.use(express.json()) é um exemplo de:",
        ["middleware", "controller", "migration", "webhook"],
        0
      ),
      mc(
        "PUT /recados/3 em REST normalmente:",
        [
          "Substitui o recado 3",
          "Cria sempre um recado novo",
          "Apaga todos os recados",
          "Só lê o recado 3",
        ],
        0
      ),
      mc(
        "401 Unauthorized indica:",
        [
          "O cliente não autenticou (ou o token é inválido)",
          "O recurso não existe",
          "O servidor caiu",
          "O JSON está malformado",
        ],
        0
      ),
    ],
  },
  {
    key: "ne2",
    kind: "exam",
    type: "quiz",
    title: "Avaliação final — API completa",
    description: "Fecha o semestre: CRUD, status codes e organização da API.",
    dueDate: "2026-11-12 23:59:00",
    orderIndex: 12,
    questions: [
      mc(
        "Um DELETE /recados/3 com sucesso costuma responder:",
        ["204 No Content ou 200 OK", "201 Created", "302 Found", "500"],
        0
      ),
      mc(
        "Separar rotas e acesso ao banco ajuda principalmente a:",
        [
          "Testar e manter a API com menos acoplamento",
          "Acelerar o npm install",
          "Evitar o uso de JSON",
          "Dispensar o Express",
        ],
        0
      ),
    ],
  },
];

const REACT_CURRICULUM = [
  {
    key: "r1",
    kind: "activity",
    type: "quiz",
    title: "Quiz: JSX e o primeiro componente",
    description: "O que o React renderiza e como um componente começa.",
    dueDate: "2026-08-29 23:59:00",
    orderIndex: 1,
    questions: [
      mc(
        "JSX é:",
        [
          "Uma sintaxe que descreve a UI e vira JavaScript",
          "Um banco de dados do React",
          "Um substituto do CSS",
          "Um servidor HTTP",
        ],
        0
      ),
      mc(
        "Um componente de função React precisa, no mínimo:",
        [
          "Retornar JSX (ou null)",
          "Ter uma classe com constructor",
          "Chamar res.json()",
          "Exportar uma migration",
        ],
        0
      ),
    ],
  },
  {
    key: "r2",
    kind: "activity",
    type: "quiz",
    title: "Quiz: props versus estado",
    description: "Quando o dado vem de fora e quando o componente guarda o valor.",
    dueDate: "2026-09-05 23:59:00",
    orderIndex: 2,
    questions: [
      mc(
        "Props são:",
        [
          "Dados que o pai passa para o filho",
          "O estado interno que o filho altera à vontade",
          "Arquivos CSS globais",
          "Rotas do Express",
        ],
        0
      ),
      mc(
        "O estado (state) serve para:",
        [
          "Valores que mudam com a interação e disparam nova renderização",
          "Guardar a senha do banco",
          "Substituir o package.json",
          "Configurar o MySQL",
        ],
        0
      ),
    ],
  },
  {
    key: "r3",
    kind: "activity",
    type: "text",
    title: "Texto: quando um dado vira estado",
    description: "Cite um exemplo de tela e o que ficaria em useState.",
    dueDate: "2026-09-12 23:59:00",
    orderIndex: 3,
    questions: [
      text(
        "Escolha uma tela simples (login, lista de recados ou formulário) e explique o que ficaria em props e o que ficaria em estado."
      ),
    ],
  },
  {
    key: "r4",
    kind: "activity",
    type: "quiz",
    title: "Atividade Final: o que o useState devolve",
    description: "Atividade curta de múltipla escolha da semana. Dá para fazer em poucos minutos.",
    dueDate: "2026-09-24 23:59:00",
    orderIndex: 4,
    questions: [
      mc(
        "const [count, setCount] = useState(0) — count é:",
        [
          "O valor atual do estado",
          "Uma Promise do React",
          "O elemento HTML raiz",
          "O CSS do componente",
        ],
        0
      ),
      mc(
        "Para somar 1 no clique, o caminho correto é:",
        [
          "setCount(count + 1) (ou o updater setCount((n) => n + 1))",
          "count = count + 1",
          "this.count++",
          "document.querySelector('#count').value++",
        ],
        0
      ),
      mc(
        "useState deve ser chamado:",
        [
          "No topo do componente, sempre na mesma ordem",
          "Dentro de um if aleatório",
          "Só no arquivo index.html",
          "Depois do return",
        ],
        0
      ),
    ],
  },
  {
    key: "r5",
    kind: "activity",
    type: "quiz",
    title: "Quiz: listas e a prop key",
    description: "Por que o React pede key em cada item.",
    dueDate: "2026-10-03 23:59:00",
    orderIndex: 5,
    questions: [
      mc(
        "A prop key numa lista ajuda o React a:",
        [
          "Identificar cada item entre renderizações",
          "Estilizar o item com CSS",
          "Fazer fetch no servidor",
          "Criar a rota /key",
        ],
        0
      ),
      mc(
        "Usar o índice do array como key é arriscado quando:",
        [
          "A lista pode reordenar, inserir ou remover itens",
          "Há só um item estático",
          "O componente não tem CSS",
          "O projeto usa Vite",
        ],
        0
      ),
    ],
  },
  {
    key: "r6",
    kind: "activity",
    type: "text",
    title: "Texto: um formulário controlado",
    description: "Explique value + onChange num input de React.",
    dueDate: "2026-10-10 23:59:00",
    orderIndex: 6,
    questions: [
      text(
        "Explique o que é um input controlado no React (value + onChange) e por que isso facilita validar o campo antes do envio."
      ),
    ],
  },
  {
    key: "r7",
    kind: "activity",
    type: "quiz",
    title: "Quiz: useEffect em uma frase",
    description: "Efeito colateral depois da renderização.",
    dueDate: "2026-10-17 23:59:00",
    orderIndex: 7,
    questions: [
      mc(
        "useEffect com array de dependências vazio ([]) roda:",
        [
          "Depois da primeira renderização (montagem)",
          "A cada tecla no input",
          "Antes do React existir",
          "Só no servidor MySQL",
        ],
        0
      ),
      mc(
        "Buscar dados de uma API no carregamento da tela combina com:",
        ["useEffect", "useState puro, sem efeito", "index.css", "localStorage obrigatório"],
        0
      ),
    ],
  },
  {
    key: "r8",
    kind: "activity",
    type: "quiz",
    title: "Quiz: elevar estado ou não",
    description: "Quando o pai precisa guardar o valor.",
    dueDate: "2026-10-24 23:59:00",
    orderIndex: 8,
    questions: [
      mc(
        "Dois irmãos precisam do mesmo filtro. O estado do filtro deve ficar:",
        [
          "No pai, passado como props",
          "Duplicado em cada irmão, sem conversar",
          "No MySQL obrigatoriamente",
          "No arquivo vite.config.js",
        ],
        0
      ),
    ],
  },
  {
    key: "r9",
    kind: "activity",
    type: "text",
    title: "Texto: quebrar a tela em componentes",
    description: "Proponha 3 componentes para uma lista de recados.",
    dueDate: "2026-10-31 23:59:00",
    orderIndex: 9,
    questions: [
      text(
        "Para uma tela de recados (lista + formulário), proponha 3 componentes e diga o que cada um recebe de props."
      ),
    ],
  },
  {
    key: "r10",
    kind: "activity",
    type: "upload",
    title: "Projeto: lista de recados em React",
    description: "Entregue o recorte da interface (lista, formulário e estado). Zip, PDF ou prints comentados.",
    dueDate: "2026-11-07 23:59:00",
    orderIndex: 10,
    questions: [upload("Envie o arquivo do projeto (zip, pdf ou doc).")],
  },
  {
    key: "re1",
    kind: "exam",
    type: "quiz",
    title: "Avaliação parcial — Fundamentos de React",
    description: "Prova objetiva: JSX, props, estado e o primeiro hook.",
    dueDate: "2026-09-16 23:59:00",
    orderIndex: 11,
    questions: [
      mc(
        "Um componente React deve ser puro no sentido de:",
        [
          "A mesma entrada (props/estado) produz a mesma UI",
          "Nunca usar CSS",
          "Só funcionar com classes",
          "Chamar o banco direto no JSX",
        ],
        0
      ),
      mc(
        "Alterar o estado com o setter do useState:",
        [
          "Agenda uma nova renderização",
          "Muda o DOM na mão",
          "Reinicia o Node",
          "Apaga as props",
        ],
        0
      ),
    ],
  },
  {
    key: "re2",
    kind: "exam",
    type: "quiz",
    title: "Avaliação final — React na prática",
    description: "Fecha o semestre: listas, formulário e efeitos.",
    dueDate: "2026-11-12 23:59:00",
    orderIndex: 12,
    questions: [
      mc(
        "Um formulário de recado com título no estado é, na prática:",
        ["Um input controlado", "Um webhook", "Uma migration", "Um cookie HttpOnly"],
        0
      ),
      mc(
        "A key estável de um recado na lista deve ser, de preferência:",
        ["O id do recado", "O índice se a lista reordena", "O texto inteiro", "Math.random()"],
        0
      ),
    ],
  },
];

const NODE_TEXT_ANSWERS = {
  n3: [
    "O middleware intercepta a request antes da rota final. Dá para validar o token, parsear JSON ou registrar log. No dia a dia uso express.json() e um requireAuth que lê o JWT.",
    "Middleware é uma função (req, res, next). Se estiver ok, chama next(); se não, responde 401. Exemplo: checar Authorization e só então seguir para a rota.",
    "Serve para reaproveitar lógica entre rotas: CORS, log, autenticação. Sem isso cada handler repetiria o mesmo if.",
  ],
  n6: [
    "O cliente chama GET /recados. A request passa pelo express.json() (mesmo sem body), chega na rota, o service consulta o MySQL e o handler devolve res.json(lista).",
    "Browser -> Express -> rota GET -> service -> banco -> JSON na resposta, com status 200.",
  ],
};

const REACT_TEXT_ANSWERS = {
  r3: [
    "Numa lista de recados, o array viria do pai (ou da API) como props. O texto do campo de busca ficaria em useState, porque muda a cada tecla.",
    "Login: e-mail e senha em estado. O onSubmit recebe esses valores. Nada disso precisa ser prop, a menos que o pai valide junto.",
  ],
};

function mc(questionText, options, correctIndex) {
  return {
    question_type: "multiple_choice",
    question_text: questionText,
    options: options.map((optionText, index) => ({
      option_text: optionText,
      is_correct: index === correctIndex ? 1 : 0,
    })),
  };
}

function text(questionText) {
  return { question_type: "text", question_text: questionText };
}

function upload(questionText) {
  return { question_type: "upload", question_text: questionText };
}

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function padClass(conn, { courseId, classId, adminUserId, minCount, enrolledAt }) {
  const [countRows] = await conn.query(
    `SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND status = 'active'`,
    [classId]
  );
  const needed = Math.max(0, minCount - Number(countRows[0]?.n || 0));
  if (needed === 0) return;

  const [candidates] = await conn.query(
    `SELECT s.id
     FROM students s
     WHERE s.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM enrollments e
         WHERE e.student_id = s.id
           AND e.course_id = ?
           AND e.status IN ('active', 'inactive', 'locked', 'completed')
       )
     ORDER BY s.id
     LIMIT ?`,
    [courseId, needed]
  );

  for (const student of candidates) {
    await conn.query(
      `INSERT INTO enrollments
        (student_id, course_id, class_id, status, enrolled_at, origin, created_by_user_id, activated_at, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, 'administrative', ?, ?, NOW(), NOW())`,
      [student.id, courseId, classId, enrolledAt, adminUserId, enrolledAt]
    );
  }
}

async function listClassStudentIds(conn, classId) {
  const [rows] = await conn.query(
    `SELECT student_id FROM enrollments WHERE class_id = ? AND status = 'active' ORDER BY student_id`,
    [classId]
  );
  return rows.map((row) => Number(row.student_id));
}

async function fillAttendance(conn, { classId, marinaStudentId, pedroStudentId }) {
  const [sessions] = await conn.query(
    `SELECT id, session_date FROM class_sessions
     WHERE class_id = ? AND status = 'completed'
     ORDER BY session_date, id`,
    [classId]
  );
  const studentIds = await listClassStudentIds(conn, classId);
  const extras = studentIds.filter((id) => id !== marinaStudentId && id !== pedroStudentId);

  for (const [sessionIndex, session] of sessions.entries()) {
    for (const studentId of studentIds) {
      const existing = await one(
        conn,
        `SELECT id FROM attendance WHERE class_session_id = ? AND student_id = ? LIMIT 1`,
        [session.id, studentId]
      );
      if (existing) continue;

      let status = "present";
      if (studentId === pedroStudentId && sessionIndex === 2) status = "absent";
      if (extras[0] && studentId === extras[0] && sessionIndex >= 3) status = "absent";
      if (extras[1] && studentId === extras[1] && sessionIndex === sessions.length - 1) {
        status = "absent";
      }

      await conn.query(
        `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [session.id, studentId, status]
      );
    }
  }
}

async function replaceQuestions(conn, activityId, questions) {
  await conn.query(`DELETE FROM grades WHERE activity_id = ?`, [activityId]);
  await conn.query(`DELETE FROM submissions WHERE activity_id = ?`, [activityId]);
  await conn.query(`DELETE FROM activity_questions WHERE activity_id = ?`, [activityId]);

  const pointsEach = Number((10 / questions.length).toFixed(2));

  for (const [index, question] of questions.entries()) {
    const points = index === questions.length - 1 ? Number((10 - pointsEach * (questions.length - 1)).toFixed(2)) : pointsEach;
    const [result] = await conn.query(
      `INSERT INTO activity_questions (activity_id, question_text, question_type, points, order_index)
       VALUES (?, ?, ?, ?, ?)`,
      [activityId, question.question_text, question.question_type, points, index + 1]
    );

    if (question.question_type === "multiple_choice") {
      for (const option of question.options) {
        await conn.query(
          `INSERT INTO activity_options (question_id, option_text, is_correct) VALUES (?, ?, ?)`,
          [result.insertId, option.option_text, option.is_correct]
        );
      }
    }
  }
}

async function ensureCurriculum(conn, { courseId, specs, archiveTitles }) {
  if (archiveTitles?.length) {
    for (const title of archiveTitles) {
      await conn.query(
        `UPDATE activities SET status = 'archived', updated_at = NOW() WHERE course_id = ? AND title = ?`,
        [courseId, title]
      );
    }
  }

  const idsByKey = {};

  for (const spec of specs) {
    let row = await one(
      conn,
      `SELECT id FROM activities WHERE course_id = ? AND title = ? LIMIT 1`,
      [courseId, spec.title]
    );

    if (!row && spec.key === "n1") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4979 LIMIT 1`);
    }
    if (!row && spec.key === "n2") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4980 LIMIT 1`);
    }
    if (!row && spec.key === "n3") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 5757 LIMIT 1`);
    }
    if (!row && spec.key === "n4") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4981 LIMIT 1`);
    }
    if (!row && spec.key === "n5") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4982 LIMIT 1`);
    }
    if (!row && spec.key === "n6") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4983 LIMIT 1`);
    }
    if (!row && spec.key === "n7") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4984 LIMIT 1`);
    }
    if (!row && spec.key === "n10") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 5758 LIMIT 1`);
    }
    if (!row && spec.key === "ne1") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4977 LIMIT 1`);
    }
    if (!row && spec.key === "r1") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4947 LIMIT 1`);
    }
    if (!row && spec.key === "r2") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4948 LIMIT 1`);
    }
    if (!row && spec.key === "r3") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 23 LIMIT 1`);
    }
    if (!row && spec.key === "r4") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4949 LIMIT 1`);
    }
    if (!row && spec.key === "r5") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4950 LIMIT 1`);
    }
    if (!row && spec.key === "r6") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4951 LIMIT 1`);
    }
    if (!row && spec.key === "r7") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4952 LIMIT 1`);
    }
    if (!row && spec.key === "r10") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 5756 LIMIT 1`);
    }
    if (!row && spec.key === "re1") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 21 LIMIT 1`);
    }
    if (!row && spec.key === "re2") {
      row = await one(conn, `SELECT id FROM activities WHERE id = 4945 LIMIT 1`);
    }

    if (!row) {
      const [result] = await conn.query(
        `INSERT INTO activities
          (course_id, class_id, activity_kind, title, description, type, due_date, max_score, order_index, is_required, status, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, 10, ?, 1, 'active', NOW(), NOW())`,
        [courseId, spec.kind, spec.title, spec.description, spec.type, spec.dueDate, spec.orderIndex]
      );
      row = { id: result.insertId };
    } else {
      await conn.query(
        `UPDATE activities
         SET class_id = NULL, activity_kind = ?, title = ?, description = ?, type = ?,
             due_date = ?, max_score = 10, order_index = ?, is_required = 1, status = 'active', updated_at = NOW()
         WHERE id = ?`,
        [spec.kind, spec.title, spec.description, spec.type, spec.dueDate, spec.orderIndex, row.id]
      );
    }

    await replaceQuestions(conn, row.id, spec.questions);
    idsByKey[spec.key] = row.id;
  }

  return idsByKey;
}

async function loadQuestions(conn, activityId) {
  const [questions] = await conn.query(
    `SELECT id, question_type, points FROM activity_questions WHERE activity_id = ? ORDER BY order_index, id`,
    [activityId]
  );

  for (const question of questions) {
    const [options] = await conn.query(
      `SELECT id, is_correct FROM activity_options WHERE question_id = ? ORDER BY id`,
      [question.id]
    );
    question.options = options;
  }

  return questions;
}

async function seedSubmission(conn, {
  activityId,
  studentId,
  courseId,
  teacherId,
  title,
  status,
  daysAgo,
  score,
  textAnswers = [],
}) {
  const existing = await one(
    conn,
    `SELECT id FROM submissions WHERE activity_id = ? AND student_id = ? LIMIT 1`,
    [activityId, studentId]
  );
  if (existing) return;

  const questions = await loadQuestions(conn, activityId);

  const [result] = await conn.query(
    `INSERT INTO submissions
      (activity_id, student_id, status, score, feedback, graded_by_teacher_id, submitted_at, graded_at, created_at, updated_at)
     VALUES (
       ?, ?, ?, ?, ?, ?,
       DATE_SUB('2026-09-20 21:10:00', INTERVAL ? DAY),
       IF(? = 'graded', DATE_SUB('2026-09-20 11:00:00', INTERVAL ? DAY), NULL),
       NOW(), NOW()
     )`,
    [
      activityId,
      studentId,
      status,
      status === "graded" ? score : null,
      status === "graded" ? "Corrigido. Bom trabalho, siga para a próxima prática." : null,
      status === "graded" ? teacherId : null,
      daysAgo,
      status,
      Math.max(0, daysAgo - 1),
    ]
  );

  let awardedTotal = 0;

  for (const [index, question] of questions.entries()) {
    if (question.question_type === "multiple_choice") {
      const correct = question.options.find((option) => Number(option.is_correct) === 1) || question.options[0];
      const pick = status === "graded" ? correct : question.options[0] || correct;
      const isCorrect = pick && correct && pick.id === correct.id ? 1 : 0;
      const awarded = status === "graded" && isCorrect ? Number(question.points) : 0;
      awardedTotal += awarded;
      await conn.query(
        `INSERT INTO submission_answers
          (submission_id, question_id, option_id, answer_text, is_correct, score_awarded)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [result.insertId, question.id, pick?.id || null, isCorrect, awarded]
      );
    } else if (question.question_type === "text") {
      const answer = textAnswers[index] || textAnswers[0] || "Resposta enviada pela turma.";
      const awarded = status === "graded" ? Number(question.points) : null;
      awardedTotal += Number(awarded || 0);
      await conn.query(
        `INSERT INTO submission_answers
          (submission_id, question_id, option_id, answer_text, is_correct, score_awarded)
         VALUES (?, ?, NULL, ?, NULL, ?)`,
        [result.insertId, question.id, answer, awarded]
      );
    }
  }

  if (status === "graded") {
    const finalScore = score ?? awardedTotal;
    await conn.query(`UPDATE submissions SET score = ? WHERE id = ?`, [finalScore, result.insertId]);
    await conn.query(
      `INSERT INTO grades
        (submission_id, student_id, course_id, activity_id, teacher_id, title, score, max_score, feedback, graded_at, created_at, updated_at)
       VALUES (
         ?, ?, ?, ?, ?, ?, ?, 10, 'Corrigido. Bom trabalho, siga para a próxima prática.',
         DATE_SUB('2026-09-20 11:00:00', INTERVAL ? DAY), NOW(), NOW()
       )`,
      [result.insertId, studentId, courseId, activityId, teacherId, title, finalScore, Math.max(0, daysAgo - 1)]
    );
  }
}

async function seedCourseWork(conn, {
  courseId,
  classId,
  teacherId,
  marinaStudentId,
  pedroStudentId,
  ids,
  textAnswers,
  includeMarina,
}) {
  const classmates = (await listClassStudentIds(conn, classId)).filter(
    (id) => id !== marinaStudentId && id !== pedroStudentId
  );
  const protagonists = includeMarina ? [marinaStudentId, pedroStudentId] : [pedroStudentId];
  const prefix = ids.n1 ? "n" : "r";

  for (const key of [`${prefix}1`, `${prefix}2`, `${prefix}3`]) {
    const activityId = ids[key];
    const spec = (prefix === "n" ? NODE_CURRICULUM : REACT_CURRICULUM).find((item) => item.key === key);
    const answers = textAnswers[key] || [];

    for (const [index, studentId] of protagonists.entries()) {
      await seedSubmission(conn, {
        activityId,
        studentId,
        courseId,
        teacherId,
        title: spec.title,
        status: "graded",
        daysAgo: key.endsWith("1") ? 22 : key.endsWith("2") ? 15 : 8,
        score: studentId === marinaStudentId ? 9.5 : 8.5,
        textAnswers: [answers[index] || answers[0]].filter(Boolean),
      });
    }

    for (const [index, studentId] of classmates.entries()) {
      await seedSubmission(conn, {
        activityId,
        studentId,
        courseId,
        teacherId,
        title: spec.title,
        status: "graded",
        daysAgo: 10,
        score: 8 + (index % 3) * 0.5,
        textAnswers: [answers[index % answers.length] || answers[0]].filter(Boolean),
      });
    }
  }

  const examKey = `${prefix}e1`;
  const examSpec = (prefix === "n" ? NODE_CURRICULUM : REACT_CURRICULUM).find((item) => item.key === examKey);

  for (const studentId of protagonists) {
    await seedSubmission(conn, {
      activityId: ids[examKey],
      studentId,
      courseId,
      teacherId,
      title: examSpec.title,
      status: "graded",
      daysAgo: 4,
      score: studentId === marinaStudentId ? 8.5 : 7.5,
    });
  }

  const fourthKey = `${prefix}4`;
  const fourthSpec = (prefix === "n" ? NODE_CURRICULUM : REACT_CURRICULUM).find((item) => item.key === fourthKey);

  for (const studentId of classmates) {
    await seedSubmission(conn, {
      activityId: ids[fourthKey],
      studentId,
      courseId,
      teacherId: prefix === "n" ? teacherId : teacherId,
      title: fourthSpec.title,
      status: "pending_review",
      daysAgo: 1,
    });
  }
}

async function convertPedroNodeToMonthly(conn, { enrollmentId, adminUserId }) {
  const contract = await one(
    conn,
    `SELECT id FROM financial_contracts WHERE enrollment_id = ? LIMIT 1`,
    [enrollmentId]
  );
  if (!contract) return;

  await conn.query(
    `UPDATE financial_contracts
     SET billing_type = 'monthly_plan',
         plan_name = 'Plano mensal (4x)',
         total_amount = ?,
         monthly_payment_count = ?,
         monthly_payment_amount = ?,
         status = 'overdue',
         updated_at = NOW()
     WHERE id = ?`,
    [MONTHLY_AMOUNT * MONTHLY_COUNT, MONTHLY_COUNT, MONTHLY_AMOUNT, contract.id]
  );

  const [existing] = await conn.query(
    `SELECT id, installment_number, status FROM invoices WHERE financial_contract_id = ? ORDER BY id`,
    [contract.id]
  );
  const first = existing.find((row) => Number(row.installment_number) === 1) || existing[0];

  if (first) {
    await conn.query(
      `UPDATE invoices
       SET invoice_type = 'monthly_payment',
           installment_number = 1,
           installment_count = ?,
           description = 'Mensalidade 1/4 — Introdução ao Node.js e Express',
           original_amount = ?,
           amount = ?,
           due_date = '2026-08-18',
           status = 'paid',
           paid_at = '2026-08-18 14:10:00',
           updated_at = NOW()
       WHERE id = ?`,
      [MONTHLY_COUNT, MONTHLY_AMOUNT, MONTHLY_AMOUNT, first.id]
    );
    await conn.query(`UPDATE payments SET amount = ? WHERE invoice_id = ? AND status = 'approved'`, [
      MONTHLY_AMOUNT,
      first.id,
    ]);
  }

  const specs = [
    [2, "2026-09-10", "overdue", "Mensalidade 2/4 — Introdução ao Node.js e Express"],
    [3, "2026-10-10", "pending", "Mensalidade 3/4 — Introdução ao Node.js e Express"],
    [4, "2026-11-10", "pending", "Mensalidade 4/4 — Introdução ao Node.js e Express"],
  ];

  for (const [number, dueDate, status, description] of specs) {
    const found = existing.find((row) => Number(row.installment_number) === number);
    if (found) {
      await conn.query(
        `UPDATE invoices
         SET invoice_type = 'monthly_payment', installment_count = ?, description = ?,
             original_amount = ?, amount = ?, due_date = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [MONTHLY_COUNT, description, MONTHLY_AMOUNT, MONTHLY_AMOUNT, dueDate, status, found.id]
      );
      continue;
    }

    await conn.query(
      `INSERT INTO invoices
        (financial_contract_id, invoice_type, installment_number, installment_count,
         description, original_amount, amount, discount_amount, due_date, status, created_at, updated_at)
       VALUES (?, 'monthly_payment', ?, ?, ?, ?, ?, 0, ?, ?, NOW(), NOW())`,
      [contract.id, number, MONTHLY_COUNT, description, MONTHLY_AMOUNT, MONTHLY_AMOUNT, dueDate, status]
    );
  }

  void adminUserId;
}

async function enrichEscolaDemoJourney(conn, {
  adminUserId,
  teacherId,
  marinaStudentId,
  pedroStudentId,
  pedroNodeEnrollmentId,
}) {
  await padClass(conn, {
    courseId: NODE_COURSE_ID,
    classId: NODE_CLASS_ID,
    adminUserId,
    minCount: 10,
    enrolledAt: "2026-08-18 12:00:00",
  });
  await padClass(conn, {
    courseId: REACT_COURSE_ID,
    classId: REACT_CLASS_ID,
    adminUserId,
    minCount: 10,
    enrolledAt: "2026-08-19 10:00:00",
  });

  await convertPedroNodeToMonthly(conn, {
    enrollmentId: pedroNodeEnrollmentId,
    adminUserId,
  });

  await conn.query(`UPDATE activities SET status = 'archived' WHERE id IN (4978, 4946, 25, 5725)`);
  await conn.query(`UPDATE activities SET status = 'archived' WHERE title LIKE 'TEST ETAPA5D%'`);

  const nodeIds = await ensureCurriculum(conn, {
    courseId: NODE_COURSE_ID,
    specs: NODE_CURRICULUM,
  });
  const reactIds = await ensureCurriculum(conn, {
    courseId: REACT_COURSE_ID,
    specs: REACT_CURRICULUM,
  });

  const reactTeacher = await one(conn, `SELECT teacher_id FROM classes WHERE id = ? LIMIT 1`, [REACT_CLASS_ID]);

  await seedCourseWork(conn, {
    courseId: NODE_COURSE_ID,
    classId: NODE_CLASS_ID,
    teacherId,
    marinaStudentId,
    pedroStudentId,
    ids: nodeIds,
    textAnswers: NODE_TEXT_ANSWERS,
    includeMarina: true,
  });

  await seedCourseWork(conn, {
    courseId: REACT_COURSE_ID,
    classId: REACT_CLASS_ID,
    teacherId: reactTeacher?.teacher_id || teacherId,
    marinaStudentId,
    pedroStudentId,
    ids: reactIds,
    textAnswers: REACT_TEXT_ANSWERS,
    includeMarina: false,
  });

  await fillAttendance(conn, { classId: NODE_CLASS_ID, marinaStudentId, pedroStudentId });
}

module.exports = {
  enrichEscolaDemoJourney,
};

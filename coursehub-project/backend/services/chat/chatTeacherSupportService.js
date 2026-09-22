const {
  createServiceError,
  getStudentIdByUserId,
  getActiveEnrollmentForStudent,
} = require("../classes/classAccessService");

const {
  createConversation,
} = require("./chatConversationService");


const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 4000;


const ALLOWED_TOPICS = [
  "content",
  "activity",
  "exam",
  "grade",
  "attendance",
  "session",
  "general",
];


/**
 * ============================================================
 * BUSCAR PROFESSORES DISPONÍVEIS PARA O ALUNO
 * ============================================================
 *
 * Um aluno só pode conversar com professores que:
 *
 * 1. estejam ativos;
 * 2. possuam usuário ativo;
 * 3. estejam vinculados ao curso;
 * 4. o aluno possua matrícula ativa nesse curso.
 *
 *
 * A relação oficial atual é:
 *
 * course_teachers
 *
 * Porém ainda mantemos compatibilidade com:
 *
 * courses.teacher_id
 *
 * para cursos antigos.
 */
async function listEligibleTeachersForStudentCourse(
  db,
  {
    userId,
    courseId,
  }
) {

  const normalizedCourseId =
    Number(courseId);


  if (
    !Number.isInteger(
      normalizedCourseId
    ) ||
    normalizedCourseId <= 0
  ) {

    throw createServiceError(
      "Curso inválido.",
      400
    );
  }


  const runner =
    db.promise();


  /**
   * Descobre o student.id
   * associado ao usuário autenticado.
   */
  const studentId =
    await getStudentIdByUserId(
      runner,
      userId
    );


  if (!studentId) {

    throw createServiceError(
      "Aluno não encontrado.",
      404
    );
  }


  /**
   * Segurança:
   *
   * o aluno só pode listar professores
   * de curso em que realmente está matriculado.
   */
  const enrollment =
    await getActiveEnrollmentForStudent(
      runner,
      {
        studentId,
        courseId:
          normalizedCourseId,
      }
    );


  if (!enrollment) {

    throw createServiceError(
      "Você não possui matrícula ativa neste curso.",
      403
    );
  }


  /**
   * ==========================================================
   * PROFESSORES DO CURSO
   * ==========================================================
   *
   * Primeira parte:
   *
   * course_teachers
   *
   * Segunda parte:
   *
   * courses.teacher_id legado
   *
   *
   * UNION impede duplicidade caso o professor
   * esteja presente nas duas fontes.
   */
  const [rows] =
    await runner.query(
      `
        SELECT
          available.teacher_id,
          available.teacher_user_id,
          available.name,
          available.avatar_key,
          available.is_class_teacher

        FROM
        (
          SELECT
            t.id AS teacher_id,
            u.id AS teacher_user_id,
            u.name,
            u.avatar_key,

            CASE
              WHEN cl.teacher_id = t.id
              THEN 1
              ELSE 0
            END AS is_class_teacher

          FROM course_teachers ct

          INNER JOIN teachers t
            ON t.id = ct.teacher_id
           AND t.status = 'active'

          INNER JOIN users u
            ON u.id = t.user_id
           AND u.status = 'active'

          LEFT JOIN classes cl
            ON cl.id = ?

          WHERE ct.course_id = ?
            AND ct.status = 'active'


          UNION


          SELECT
            t.id AS teacher_id,
            u.id AS teacher_user_id,
            u.name,
            u.avatar_key,

            CASE
              WHEN cl.teacher_id = t.id
              THEN 1
              ELSE 0
            END AS is_class_teacher

          FROM courses c

          INNER JOIN teachers t
            ON t.id = c.teacher_id
           AND t.status = 'active'

          INNER JOIN users u
            ON u.id = t.user_id
           AND u.status = 'active'

          LEFT JOIN classes cl
            ON cl.id = ?

          WHERE c.id = ?
            AND c.teacher_id IS NOT NULL

        ) available

        ORDER BY
          available.is_class_teacher DESC,
          available.name ASC
      `,
      [
        enrollment.class_id || null,
        normalizedCourseId,

        enrollment.class_id || null,
        normalizedCourseId,
      ]
    );


  return {
    courseId:
      normalizedCourseId,

    classId:
      enrollment.class_id || null,

    items:
      rows.map(
        (row) => ({
          teacherId:
            Number(
              row.teacher_id
            ),

          userId:
            Number(
              row.teacher_user_id
            ),

          name:
            row.name,

          avatarKey:
            row.avatar_key || null,

          /**
           * Se esse professor também
           * for o responsável específico
           * pela turma do aluno.
           */
          isClassTeacher:
            Boolean(
              row.is_class_teacher
            ),
        })
      ),
  };
}


/**
 * ============================================================
 * VALIDAR PROFESSOR ESCOLHIDO
 * ============================================================
 *
 * Não confiamos simplesmente no teacherId
 * vindo do frontend.
 *
 * Mesmo se alguém alterar o request pelo
 * DevTools/Postman, o backend garante:
 *
 * - professor ativo;
 * - usuário ativo;
 * - professor pertencente ao curso.
 */
async function getSelectedTeacher(
  runner,
  {
    courseId,
    teacherId,
  }
) {

  const normalizedTeacherId =
    Number(
      teacherId
    );


  if (
    !Number.isInteger(
      normalizedTeacherId
    ) ||
    normalizedTeacherId <= 0
  ) {

    throw createServiceError(
      "Selecione um professor.",
      400
    );
  }


  const [rows] =
    await runner.query(
      `
        SELECT
          t.id AS teacher_id,
          u.id AS teacher_user_id,
          u.name AS teacher_name

        FROM teachers t

        INNER JOIN users u
          ON u.id = t.user_id
         AND u.status = 'active'

        WHERE t.id = ?
          AND t.status = 'active'

          AND
          (
            EXISTS
            (
              SELECT 1
              FROM course_teachers ct
              WHERE ct.course_id = ?
                AND ct.teacher_id = t.id
                AND ct.status = 'active'
            )

            OR EXISTS
            (
              SELECT 1
              FROM courses c
              WHERE c.id = ?
                AND c.teacher_id = t.id
            )
          )

        LIMIT 1
      `,
      [
        normalizedTeacherId,
        courseId,
        courseId,
      ]
    );


  return (
    rows[0] ||
    null
  );
}


/**
 * ============================================================
 * ABRIR DÚVIDA COM PROFESSOR
 * ============================================================
 */
async function openTeacherQuestion(
  db,
  {
    userId,
    courseId,
    classId,
    teacherId,
    topic,
    subject,
    body,
  }
) {

  const normalizedCourseId =
    Number(
      courseId
    );


  const normalizedClassId =
    classId
      ? Number(
          classId
        )
      : null;


  const normalizedTeacherId =
    Number(
      teacherId
    );


  const trimmedSubject =
    typeof subject === "string"
      ? subject.trim()
      : "";


  const trimmedBody =
    typeof body === "string"
      ? body.trim()
      : "";


  /**
   * ==========================================================
   * VALIDAÇÕES BÁSICAS
   * ==========================================================
   */

  if (
    !Number.isInteger(
      normalizedCourseId
    ) ||
    normalizedCourseId <= 0
  ) {

    throw createServiceError(
      "Curso inválido.",
      400
    );
  }


  if (
    !Number.isInteger(
      normalizedTeacherId
    ) ||
    normalizedTeacherId <= 0
  ) {

    throw createServiceError(
      "Selecione o professor com quem deseja conversar.",
      400
    );
  }


  if (
    !ALLOWED_TOPICS.includes(
      topic
    )
  ) {

    throw createServiceError(
      `Tópico inválido. Use um de: ${ALLOWED_TOPICS.join(
        ", "
      )}.`,
      400
    );
  }


  if (!trimmedSubject) {

    throw createServiceError(
      "Informe o assunto da dúvida.",
      400
    );
  }


  if (
    trimmedSubject.length >
    MAX_SUBJECT_LENGTH
  ) {

    throw createServiceError(
      `O assunto deve ter no máximo ${MAX_SUBJECT_LENGTH} caracteres.`,
      400
    );
  }


  if (!trimmedBody) {

    throw createServiceError(
      "Descreva sua dúvida.",
      400
    );
  }


  if (
    trimmedBody.length >
    MAX_BODY_LENGTH
  ) {

    throw createServiceError(
      `A mensagem deve ter no máximo ${MAX_BODY_LENGTH} caracteres.`,
      400
    );
  }


  const runner =
    db.promise();


  /**
   * ==========================================================
   * IDENTIDADE DO ALUNO
   * ==========================================================
   */
  const studentId =
    await getStudentIdByUserId(
      runner,
      userId
    );


  if (!studentId) {

    throw createServiceError(
      "Aluno não encontrado.",
      404
    );
  }


  /**
   * ==========================================================
   * MATRÍCULA
   * ==========================================================
   *
   * Não basta o frontend mandar courseId.
   *
   * O backend confirma que aquele usuário
   * realmente possui matrícula ativa.
   */
  const enrollment =
    await getActiveEnrollmentForStudent(
      runner,
      {
        studentId,

        courseId:
          normalizedCourseId,
      }
    );


  if (!enrollment) {

    throw createServiceError(
      "Você não possui matrícula ativa neste curso.",
      403
    );
  }


  /**
   * Se o frontend informar classId,
   * precisa ser a turma real da matrícula.
   */
  if (
    normalizedClassId &&
    enrollment.class_id &&
    Number(
      enrollment.class_id
    ) !==
      normalizedClassId
  ) {

    throw createServiceError(
      "A turma informada não corresponde à sua matrícula neste curso.",
      403
    );
  }


  /**
   * ==========================================================
   * PROFESSOR
   * ==========================================================
   *
   * Essa é a correção principal.
   *
   * Agora o professor é escolhido pelo aluno,
   * mas SEM abrir brecha de segurança.
   */
  const teacher =
    await getSelectedTeacher(
      runner,
      {
        courseId:
          normalizedCourseId,

        teacherId:
          normalizedTeacherId,
      }
    );


  if (!teacher) {

    throw createServiceError(
      "O professor selecionado não está disponível para este curso.",
      403
    );
  }


  /**
   * ==========================================================
   * CRIAR CONVERSA
   * ==========================================================
   *
   * Participantes:
   *
   * aluno autenticado
   * +
   * professor escolhido
   */
  const {
    conversationId,
  } =
    await createConversation(
      db,
      {
        type:
          "teacher_support",

        channelKind:
          "ticket",

        title:
          trimmedSubject,

        category:
          topic,

        courseId:
          normalizedCourseId,

        classId:
          enrollment.class_id ||
          normalizedClassId,

        createdByUserId:
          userId,

        initiatorRole:
          "student",

        initialStatus:
          "waiting_staff",

        initialMessage: {
          senderUserId:
            userId,

          body:
            trimmedBody,
        },

        participants: [
          {
            userId,
            participantRole:
              "student",
          },

          {
            userId:
              teacher.teacher_user_id,

            participantRole:
              "teacher",
          },
        ],
      }
    );


  return {
    conversationId,

    teacher: {
      teacherId:
        teacher.teacher_id,

      userId:
        teacher.teacher_user_id,

      name:
        teacher.teacher_name,
    },
  };
}


module.exports = {
  ALLOWED_TOPICS,

  listEligibleTeachersForStudentCourse,

  openTeacherQuestion,
};
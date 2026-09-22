import {
  useEffect,
  useState,
} from "react";

import {
  apiFetch,
} from "../../services/APIService";

import {
  listTeacherContacts,
  openTeacherQuestion,
} from "../../services/ChatService";


const TOPICS = [
  {
    value:
      "content",

    label:
      "Conteúdo",
  },

  {
    value:
      "activity",

    label:
      "Atividade",
  },

  {
    value:
      "exam",

    label:
      "Avaliação",
  },

  {
    value:
      "grade",

    label:
      "Nota",
  },

  {
    value:
      "attendance",

    label:
      "Frequência",
  },

  {
    value:
      "session",

    label:
      "Encontro",
  },

  {
    value:
      "general",

    label:
      "Geral",
  },
];


export default function NewTeacherQuestionModal({
  onClose,
  onConversationStarted,
}) {

  /**
   * ==========================================================
   * CURSOS
   * ==========================================================
   */
  const [
    courses,
    setCourses,
  ] =
    useState([]);


  const [
    coursesLoading,
    setCoursesLoading,
  ] =
    useState(true);


  const [
    courseId,
    setCourseId,
  ] =
    useState("");


  /**
   * ==========================================================
   * PROFESSORES
   * ==========================================================
   */
  const [
    teachers,
    setTeachers,
  ] =
    useState([]);


  const [
    teachersLoading,
    setTeachersLoading,
  ] =
    useState(false);


  const [
    teacherId,
    setTeacherId,
  ] =
    useState("");


  /**
   * Turma real da matrícula retornada
   * pelo backend do chat.
   */
  const [
    classId,
    setClassId,
  ] =
    useState(null);


  /**
   * ==========================================================
   * FORM
   * ==========================================================
   */
  const [
    topic,
    setTopic,
  ] =
    useState(
      "general"
    );


  const [
    subject,
    setSubject,
  ] =
    useState("");


  const [
    body,
    setBody,
  ] =
    useState("");


  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  /**
   * ==========================================================
   * CARREGAR CURSOS DO ALUNO
   * ==========================================================
   */
  useEffect(() => {

    let cancelled =
      false;


    async function loadCourses() {

      try {

        setCoursesLoading(
          true
        );


        const result =
          await apiFetch(
            "/api/students/me/courses"
          );


        const list =
          Array.isArray(
            result
          )
            ? result
            : result?.courses ||
              [];


        if (cancelled) {
          return;
        }


        setCourses(
          list
        );


        if (
          list.length > 0
        ) {

          setCourseId(
            String(
              list[0].id
            )
          );

        } else {

          setCourseId(
            ""
          );
        }

      } catch (
        requestError
      ) {

        if (!cancelled) {

          setError(
            requestError?.message ||
              "Não foi possível carregar seus cursos."
          );
        }

      } finally {

        if (!cancelled) {

          setCoursesLoading(
            false
          );
        }
      }
    }


    loadCourses();


    return () => {

      cancelled =
        true;
    };

  }, []);


  /**
   * ==========================================================
   * CARREGAR PROFESSORES QUANDO O CURSO MUDAR
   * ==========================================================
   */
  useEffect(() => {

    if (!courseId) {

      setTeachers([]);
      setTeacherId("");
      setClassId(null);

      return undefined;
    }


    let cancelled =
      false;


    async function loadTeachers() {

      try {

        setTeachersLoading(
          true
        );


        setTeacherId(
          ""
        );


        setTeachers(
          []
        );


        setClassId(
          null
        );


        setError(
          ""
        );


        const result =
          await listTeacherContacts(
            Number(
              courseId
            )
          );


        if (cancelled) {
          return;
        }


        const list =
          Array.isArray(
            result
          )
            ? result
            : result?.items ||
              [];


        setTeachers(
          list
        );


        setClassId(
          result?.classId ||
            null
        );


        /**
         * Seleciona automaticamente
         * o primeiro professor.
         *
         * O backend ordena primeiro
         * o professor responsável pela
         * turma, quando existir.
         */
        if (
          list.length > 0
        ) {

          setTeacherId(
            String(
              list[0]
                .teacherId
            )
          );
        }

      } catch (
        requestError
      ) {

        if (!cancelled) {

          setTeachers(
            []
          );


          setTeacherId(
            ""
          );


          setError(
            requestError?.message ||
              "Não foi possível carregar os professores deste curso."
          );
        }

      } finally {

        if (!cancelled) {

          setTeachersLoading(
            false
          );
        }
      }
    }


    loadTeachers();


    return () => {

      cancelled =
        true;
    };

  }, [
    courseId,
  ]);


  /**
   * ==========================================================
   * ENVIAR
   * ==========================================================
   */
  async function handleSubmit(
    event
  ) {

    event.preventDefault();


    if (
      !courseId ||
      !teacherId ||
      !subject.trim() ||
      !body.trim()
    ) {

      return;
    }


    try {

      setSubmitting(
        true
      );


      setError(
        ""
      );


      const result =
        await openTeacherQuestion({
          courseId:
            Number(
              courseId
            ),

          classId:
            classId
              ? Number(
                  classId
                )
              : undefined,

          teacherId:
            Number(
              teacherId
            ),

          topic,

          subject:
            subject.trim(),

          body:
            body.trim(),
        });


      onConversationStarted(
        result.conversationId
      );

    } catch (
      requestError
    ) {

      setError(
        requestError?.message ||
          "Não foi possível abrir a dúvida."
      );

    } finally {

      setSubmitting(
        false
      );
    }
  }


  /**
   * Professor atualmente escolhido.
   */
  const selectedTeacher =
    teachers.find(
      (teacher) =>
        String(
          teacher.teacherId
        ) ===
        String(
          teacherId
        )
    ) ||
    null;


  return (
    <div
      className="
        fixed
        inset-0
        z-50
        flex
        items-center
        justify-center
        bg-black/40
        p-4
      "
    >

      <div
        className="
          w-full
          max-w-md
          rounded-2xl
          bg-white
          p-6
          shadow-xl
        "
      >

        {/* CABEÇALHO */}

        <div
          className="
            mb-4
            flex
            items-center
            justify-between
          "
        >

          <div>

            <h2
              className="
                text-lg
                font-bold
                text-gray-900
              "
            >
              Nova dúvida com professor
            </h2>


            <p
              className="
                mt-1
                text-xs
                text-gray-500
              "
            >
              Escolha o curso e o professor
              com quem deseja conversar.
            </p>

          </div>


          <button
            type="button"
            onClick={
              onClose
            }
            className="
              text-gray-400
              transition
              hover:text-gray-600
            "
            aria-label="Fechar"
          >
            ✕
          </button>

        </div>


        {coursesLoading ? (

          <p
            className="
              py-6
              text-center
              text-sm
              text-gray-500
            "
          >
            Carregando seus cursos...
          </p>

        ) : courses.length ===
          0 ? (

          <p
            className="
              py-6
              text-center
              text-sm
              text-gray-500
            "
          >
            Você precisa estar matriculado
            em um curso para abrir uma dúvida.
          </p>

        ) : (

          <form
            onSubmit={
              handleSubmit
            }
            className="space-y-4"
          >

            {/* CURSO */}

            <div>

              <label
                className="
                  mb-1
                  block
                  text-xs
                  font-semibold
                  text-gray-600
                "
              >
                Curso
              </label>


              <select
                value={
                  courseId
                }
                onChange={(
                  event
                ) =>
                  setCourseId(
                    event.target.value
                  )
                }
                disabled={
                  submitting
                }
                className="
                  w-full
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  focus:border-blue-500
                  focus:outline-none
                  disabled:bg-gray-100
                "
              >

                {courses.map(
                  (course) => (

                    <option
                      key={
                        course.id
                      }
                      value={
                        course.id
                      }
                    >
                      {course.name}
                    </option>

                  )
                )}

              </select>

            </div>


            {/* PROFESSOR */}

            <div>

              <label
                className="
                  mb-1
                  block
                  text-xs
                  font-semibold
                  text-gray-600
                "
              >
                Professor
              </label>


              {teachersLoading ? (

                <div
                  className="
                    rounded-xl
                    border
                    border-gray-200
                    bg-gray-50
                    px-3
                    py-3
                    text-sm
                    text-gray-500
                  "
                >
                  Carregando professores...
                </div>

              ) : teachers.length ===
                0 ? (

                <div
                  className="
                    rounded-xl
                    border
                    border-amber-200
                    bg-amber-50
                    px-3
                    py-3
                    text-sm
                    text-amber-700
                  "
                >
                  Nenhum professor ativo está
                  vinculado a este curso.
                </div>

              ) : (

                <>

                  <select
                    value={
                      teacherId
                    }
                    onChange={(
                      event
                    ) =>
                      setTeacherId(
                        event.target.value
                      )
                    }
                    disabled={
                      submitting
                    }
                    className="
                      w-full
                      rounded-xl
                      border
                      border-gray-300
                      px-3
                      py-2.5
                      text-sm
                      focus:border-blue-500
                      focus:outline-none
                      disabled:bg-gray-100
                    "
                  >

                    {teachers.map(
                      (teacher) => (

                        <option
                          key={
                            teacher.teacherId
                          }
                          value={
                            teacher.teacherId
                          }
                        >
                          {teacher.name}
                          {teacher.isClassTeacher
                            ? " — professor da sua turma"
                            : ""}
                        </option>

                      )
                    )}

                  </select>


                  {selectedTeacher && (

                    <p
                      className="
                        mt-1.5
                        text-xs
                        text-gray-500
                      "
                    >

                      Sua mensagem será enviada
                      para{" "}

                      <strong>
                        {selectedTeacher.name}
                      </strong>

                      {selectedTeacher
                        .isClassTeacher
                        ? " (responsável pela sua turma)."
                        : "."}

                    </p>

                  )}

                </>

              )}

            </div>


            {/* TÓPICO */}

            <div>

              <label
                className="
                  mb-1
                  block
                  text-xs
                  font-semibold
                  text-gray-600
                "
              >
                Tópico
              </label>


              <select
                value={
                  topic
                }
                onChange={(
                  event
                ) =>
                  setTopic(
                    event.target.value
                  )
                }
                disabled={
                  submitting
                }
                className="
                  w-full
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  focus:border-blue-500
                  focus:outline-none
                "
              >

                {TOPICS.map(
                  (option) => (

                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>

                  )
                )}

              </select>

            </div>


            {/* ASSUNTO */}

            <div>

              <label
                className="
                  mb-1
                  block
                  text-xs
                  font-semibold
                  text-gray-600
                "
              >
                Assunto
              </label>


              <input
                type="text"
                value={
                  subject
                }
                onChange={(
                  event
                ) =>
                  setSubject(
                    event.target.value.slice(
                      0,
                      180
                    )
                  )
                }
                placeholder="Resumo da sua dúvida"
                maxLength={
                  180
                }
                disabled={
                  submitting
                }
                className="
                  w-full
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  focus:border-blue-500
                  focus:outline-none
                "
              />

            </div>


            {/* MENSAGEM */}

            <div>

              <label
                className="
                  mb-1
                  block
                  text-xs
                  font-semibold
                  text-gray-600
                "
              >
                Mensagem
              </label>


              <textarea
                value={
                  body
                }
                onChange={(
                  event
                ) =>
                  setBody(
                    event.target.value.slice(
                      0,
                      4000
                    )
                  )
                }
                rows={
                  4
                }
                maxLength={
                  4000
                }
                placeholder="Descreva sua dúvida em detalhes..."
                disabled={
                  submitting
                }
                className="
                  w-full
                  resize-none
                  rounded-xl
                  border
                  border-gray-300
                  px-3
                  py-2.5
                  text-sm
                  focus:border-blue-500
                  focus:outline-none
                "
              />

            </div>


            {/* ERRO */}

            {error && (

              <p
                className="
                  rounded-xl
                  border
                  border-red-200
                  bg-red-50
                  px-3
                  py-2
                  text-sm
                  text-red-700
                "
              >
                {error}
              </p>

            )}


            {/* ENVIAR */}

            <button
              type="submit"
              disabled={
                submitting ||
                teachersLoading ||
                !courseId ||
                !teacherId ||
                !subject.trim() ||
                !body.trim()
              }
              className="
                w-full
                rounded-xl
                bg-blue-600
                px-5
                py-2.5
                text-sm
                font-semibold
                text-white
                transition
                hover:bg-blue-700
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >

              {submitting
                ? "Enviando..."
                : "Enviar dúvida"}

            </button>

          </form>
        )}

      </div>

    </div>
  );
}
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Link,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import AttendanceSummaryCard from "../../components/teachers/AttendanceSummaryCard";
import AttendanceTable from "../../components/teachers/AttendanceTable";
import SessionModal from "../../components/teachers/SessionModal";

const VALID_ATTENDANCE_STATUSES = new Set([
  "present",
  "absent",
  "late",
  "excused",
]);

const SESSION_TYPE_LABELS = {
  class: "Aula",
  review: "Revisão",
  exam: "Prova",
  presentation: "Apresentação",
  workshop: "Workshop",
  lab: "Laboratório",
  recovery: "Recuperação",
  other: "Outro",
};

const SESSION_STATUS_LABELS = {
  scheduled: "Agendado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function normalizeSession(session) {
  if (!session) return null;

  const sessionId = Number(
    session.id ??
      session.sessionId ??
      session.session_id
  );

  return {
    ...session,

    id: sessionId,

    sessionNumber: Number(
      session.sessionNumber ??
        session.session_number ??
        0
    ),

    title:
      session.title ||
      "Encontro sem título",

    sessionDate:
      session.sessionDate ??
      session.session_date ??
      null,

    startTime:
      session.startTime ??
      session.start_time ??
      null,

    endTime:
      session.endTime ??
      session.end_time ??
      null,

    sessionType:
      session.sessionType ??
      session.session_type ??
      "class",

    status:
      session.status || "scheduled",

    description:
      session.description || "",
  };
}

function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions
    .map(normalizeSession)
    .filter(
      (session) =>
        Number.isInteger(session?.id) &&
        session.id > 0
    )
    .sort(
      (firstSession, secondSession) =>
        firstSession.sessionNumber -
        secondSession.sessionNumber
    );
}

function formatSessionDate(dateValue) {
  if (!dateValue) {
    return "Data não informada";
  }

  const datePart =
    String(dateValue).split("T")[0];

  const [year, month, day] =
    datePart.split("-").map(Number);

  if (!year || !month || !day) {
    return "Data não informada";
  }

  const date = new Date(
    year,
    month - 1,
    day
  );

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  ).format(date);
}

function formatSessionTimeValue(timeValue) {
  if (!timeValue) {
    return null;
  }

  return String(timeValue).slice(0, 5);
}

function formatSessionTime(
  startTime,
  endTime
) {
  const formattedStart =
    formatSessionTimeValue(startTime);

  const formattedEnd =
    formatSessionTimeValue(endTime);

  if (formattedStart && formattedEnd) {
    return `${formattedStart} às ${formattedEnd}`;
  }

  if (formattedStart) {
    return `A partir das ${formattedStart}`;
  }

  if (formattedEnd) {
    return `Até ${formattedEnd}`;
  }

  return "Horário não informado";
}

function getSessionTypeLabel(sessionType) {
  return (
    SESSION_TYPE_LABELS[sessionType] ||
    "Outro"
  );
}

function getSessionStatusLabel(status) {
  return (
    SESSION_STATUS_LABELS[status] ||
    status ||
    "Não informado"
  );
}

function getSessionStatusClasses(status) {
  const classes = {
    scheduled:
      "border-blue-200 bg-blue-100 text-blue-700",

    completed:
      "border-emerald-200 bg-emerald-100 text-emerald-700",

    cancelled:
      "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    classes[status] ||
    "border-slate-200 bg-slate-100 text-slate-600"
  );
}

function normalizeAttendanceStatus(status) {
  if (!status) {
    return "";
  }

  return VALID_ATTENDANCE_STATUSES.has(status) ? status : "";
}

/*
 * Compatibilidade temporária:
 * aceita respostas camelCase ou snake_case.
 */
function normalizeClassData(classData) {
  if (!classData) return null;

  return {
    id: classData.id,

    name:
      classData.name ||
      classData.className ||
      classData.class_name ||
      "Turma",

    shift: classData.shift || "online",

    status: classData.status || "active",

    courseId:
      classData.courseId ??
      classData.course_id ??
      null,

    courseTitle:
      classData.courseName ||
      classData.course_name ||
      "Curso não informado",

    startDate:
      classData.startDate ??
      classData.start_date ??
      null,

    endDate:
      classData.endDate ??
      classData.end_date ??
      null,
  };
}

function normalizeStudent(student) {
  const studentId = Number(
    student.studentId ??
      student.student_id ??
      student.id
  );

  return {
    ...student,

    studentId,

    name:
      student.name ||
      student.studentName ||
      student.student_name ||
      "Aluno sem nome",

    email: student.email || "",

    registrationNumber:
      student.registrationNumber ||
      student.registration_number ||
      "",

    attendanceId:
      student.attendanceId ??
      student.attendance_id ??
      null,

    status: normalizeAttendanceStatus(
      student.status
    ),

    notes: student.notes ?? "",

    isSaved: Boolean(
      student.isSaved ??
        student.is_saved ??
        student.attendanceId ??
        student.attendance_id
    ),
  };
}

function normalizeStudents(students) {
  if (!Array.isArray(students)) return [];

  return students
    .map(normalizeStudent)
    .filter(
      (student) =>
        Number.isInteger(student.studentId) &&
        student.studentId > 0
    );
}

/*
 * O snapshot contém apenas os campos editáveis.
 * Assim, mudanças em isSaved ou attendanceId não fazem
 * a página considerar que existem alterações pendentes.
 */
function createStudentsSnapshot(students) {
  return JSON.stringify(
    students.map((student) => ({
      studentId: student.studentId,
      status: student.status,
      notes: student.notes?.trim() || "",
    }))
  );
}

export default function TeacherAttendance() {
  const { classId } = useParams();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  const { usuarioLogado } = useAuth();

  const normalizedClassId = Number(classId);

  const sessionIdFromUrl = Number(
    searchParams.get("sessionId")
  );

  const [classData, setClassData] =
    useState(null);

  const [sessions, setSessions] =
    useState([]);

  const [
    selectedSessionId,
    setSelectedSessionId,
  ] = useState(() =>
    Number.isInteger(sessionIdFromUrl) &&
    sessionIdFromUrl > 0
      ? sessionIdFromUrl
      : ""
  );

  const [students, setStudents] =
    useState([]);

  const [initialSnapshot, setInitialSnapshot] =
    useState("");

  const [loadingSessions, setLoadingSessions] =
    useState(true);

  const [
    loadingAttendance,
    setLoadingAttendance,
  ] = useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    isSessionModalOpen,
    setIsSessionModalOpen,
  ] = useState(false);

  /*
   * Impede que uma requisição antiga sobrescreva uma
   * requisição mais recente ao trocar rapidamente a data.
   */
  const requestIdRef = useRef(0);

  const selectedSession = useMemo(
  () =>
    sessions.find(
      (session) =>
        session.id ===
        Number(selectedSessionId)
    ) || null,
  [sessions, selectedSessionId]
);

const nextSessionNumber = useMemo(() => {
  if (sessions.length === 0) {
    return 1;
  }

  const highestSessionNumber =
    sessions.reduce(
      (highest, session) =>
        Math.max(
          highest,
          Number(
            session.sessionNumber || 0
          )
        ),
      0
    );

  return highestSessionNumber + 1;
}, [sessions]);

    const hasSelectedSession =
    Boolean(selectedSession);

    const loading =
    loadingSessions ||
    loadingAttendance;

  const currentSnapshot = useMemo(
    () => createStudentsSnapshot(students),
    [students]
  );

  const hasUnsavedChanges =
  useMemo(() => {
    if (
      !hasSelectedSession ||
      !students.length ||
      !initialSnapshot
    ) {
      return false;
    }

    return (
      currentSnapshot !==
      initialSnapshot
    );
  }, [
    currentSnapshot,
    initialSnapshot,
    students.length,
    hasSelectedSession,
  ]);

  /*
   * Uma chamada ainda não registrada também precisa poder
   * ser salva, mesmo que o professor mantenha todos como
   * presentes.
   */
  const hasUnsavedRecords = useMemo(
  () =>
    hasSelectedSession &&
    students.some(
      (student) =>
        !student.isSaved
    ),
  [
    students,
    hasSelectedSession,
  ]
);

  const canSave =
  hasSelectedSession &&
  students.length > 0 &&
  !loadingAttendance &&
  (hasUnsavedChanges ||
    hasUnsavedRecords);

  const summary = useMemo(() => {
    return students.reduce(
      (accumulator, student) => {
        accumulator.total += 1;

        if (
          VALID_ATTENDANCE_STATUSES.has(
            student.status
          )
        ) {
          accumulator[student.status] += 1;
        }

        return accumulator;
      },
      {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      }
    );
  }, [students]);

  async function loadSessions({
  preferredSessionId = null,
} = {}) {
  if (!usuarioLogado?.id) {
    return;
  }

  if (
    !Number.isInteger(normalizedClassId) ||
    normalizedClassId <= 0
  ) {
    return;
  }

  try {
    setLoadingSessions(true);
    setError("");

    const data = await apiFetch(
      `/api/teacher/by-user/${usuarioLogado.id}/classes/${normalizedClassId}/sessions`
    );
    console.log(data);

    const receivedSessions =
      normalizeSessions(data?.sessions);

    setClassData(
      normalizeClassData(data?.class)
    );

    setSessions(receivedSessions);

    const requestedSessionId = Number(
      preferredSessionId ||
        searchParams.get("sessionId")
    );

    const requestedSessionExists =
      receivedSessions.some(
        (session) =>
          session.id === requestedSessionId
      );

    if (requestedSessionExists) {
      setSelectedSessionId(
        requestedSessionId
      );

      setSearchParams(
        {
          sessionId: String(
            requestedSessionId
          ),
        },
        {
          replace: true,
        }
      );

      return;
    }

    setSelectedSessionId("");
    setStudents([]);
    setInitialSnapshot("");

    setSearchParams(
      {},
      {
        replace: true,
      }
    );
  } catch (loadError) {
    console.error(
      "Erro ao carregar encontros:",
      loadError
    );


    setClassData(null);
    setSessions([]);
    setSelectedSessionId("");
    setStudents([]);
    setInitialSnapshot("");

    setError(
      loadError?.message ||
        "Não foi possível carregar os encontros da turma."
    );
  } finally {
    setLoadingSessions(false);
  }
}

  async function loadAttendance(
  sessionId = selectedSessionId
) {
  if (!usuarioLogado?.id) {
    return;
  }

  if (
    !Number.isInteger(normalizedClassId) ||
    normalizedClassId <= 0
  ) {
    return;
  }

  const normalizedSessionId =
    Number(sessionId);

  if (
    !Number.isInteger(
      normalizedSessionId
    ) ||
    normalizedSessionId <= 0
  ) {
    setStudents([]);
    setInitialSnapshot("");
    return;
  }

  const currentRequestId =
    requestIdRef.current + 1;

  requestIdRef.current =
    currentRequestId;

  try {
    setLoadingAttendance(true);
    setError("");
    setSuccessMessage("");

    const data = await apiFetch(
      `/api/teacher/by-user/${usuarioLogado.id}/classes/${normalizedClassId}/sessions/${normalizedSessionId}/attendance`
    );

    if (
      currentRequestId !==
      requestIdRef.current
    ) {
      return;
    }

    const receivedStudents =
      normalizeStudents(
        data?.students ||
          data?.records
      );

    setClassData((currentClassData) =>
      normalizeClassData(
        data?.class ||
          currentClassData
      )
    );

    setStudents(receivedStudents);

    setInitialSnapshot(
      createStudentsSnapshot(
        receivedStudents
      )
    );
    } catch (fetchError) {
  if (
    currentRequestId !==
    requestIdRef.current
  ) {
    return;
  }

  
  console.error(fetchError);

  setStudents([]);
  setInitialSnapshot("");

  setError(
    fetchError?.message ||
      "Não foi possível carregar a frequência deste encontro."
  );

} finally {
    if (
      currentRequestId ===
      requestIdRef.current
    ) {
      setLoadingAttendance(false);
    }
  }
}

  useEffect(() => {
  loadSessions();
}, [
  usuarioLogado?.id,
  normalizedClassId,
]);

useEffect(() => {
  if (!selectedSessionId) {
    requestIdRef.current += 1;

    setStudents([]);
    setInitialSnapshot("");
    setLoadingAttendance(false);
    setSuccessMessage("");

    return;
  }

  loadAttendance(
    selectedSessionId
  );
}, [
  usuarioLogado?.id,
  normalizedClassId,
  selectedSessionId,
]);

useEffect(() => {
  const sessionIdFromSearchParams = Number(
    searchParams.get("sessionId")
  );

  if (
    !Number.isInteger(sessionIdFromSearchParams) ||
    sessionIdFromSearchParams <= 0
  ) {
    return;
  }

  const sessionExists = sessions.some(
    (session) =>
      session.id === sessionIdFromSearchParams
  );

  if (
    sessionExists &&
    sessionIdFromSearchParams !==
      Number(selectedSessionId)
  ) {
    setSelectedSessionId(
      sessionIdFromSearchParams
    );
  }
}, [searchParams, sessions]);

  function handleSessionChange(event) {
  const nextSessionId =
    Number(event.target.value);

  if (
    (hasUnsavedChanges ||
      hasUnsavedRecords) &&
    !window.confirm(
      "Existem registros não salvos. Deseja trocar de encontro e descartá-los?"
    )
  ) {
    return;
  }

  setError("");
  setSuccessMessage("");

  if (
    !Number.isInteger(nextSessionId) ||
    nextSessionId <= 0
  ) {
    setSelectedSessionId("");
    setStudents([]);
    setInitialSnapshot("");

    setSearchParams(
      {},
      {
        replace: true,
      }
    );

    return;
  }

  setSelectedSessionId(
    nextSessionId
  );

  setSearchParams(
    {
      sessionId: String(
        nextSessionId
      ),
    },
    {
      replace: true,
    }
  );
}

  function openCreateSessionModal() {
  setError("");
  setSuccessMessage("");
  setIsSessionModalOpen(true);
}

 function closeSessionModal() {
  setIsSessionModalOpen(false);
}

 async function handleSessionSaved(
  savedSession
) {
  const normalizedSavedSession =
    normalizeSession(savedSession);

  setIsSessionModalOpen(false);

  if (
    !normalizedSavedSession?.id
  ) {
    await loadSessions();
    return;
  }

  await loadSessions({
    preferredSessionId:
      normalizedSavedSession.id,
  });
}

  function handleRetry() {
  if (selectedSessionId) {
    loadAttendance(
      selectedSessionId
    );

    return;
  }

  loadSessions();
}

  function handleStatusChange(
  studentId,
  status
) {
  if (
    !VALID_ATTENDANCE_STATUSES.has(status)
  ) {
    return;
  }

  setSuccessMessage("");

  setStudents((currentStudents) =>
    currentStudents.map((student) =>
      student.studentId === studentId
        ? {
            ...student,
            status,
          }
        : student
    )
  );
}

  function handleNotesChange(
  studentId,
  notes
) {
  if (!hasSelectedSession) {
    return;
  }

  setSuccessMessage("");

  setStudents((currentStudents) =>
    currentStudents.map(
      (student) =>
        student.studentId ===
        studentId
          ? {
              ...student,
              notes,
            }
          : student
    )
  );
}

  function handleMarkAllPresent() {
  if (
    !hasSelectedSession ||
    students.length === 0
  ) {
    return;
  }

  setSuccessMessage("");

  setStudents((currentStudents) =>
    currentStudents.map(
      (student) => ({
        ...student,
        status: "present",
      })
    )
  );
}
  function handleResetChanges() {
    if (
        !hasSelectedSession ||
        !initialSnapshot
    ) {
        return;
    }

    const snapshotStudents = JSON.parse(
      initialSnapshot
    );

    const snapshotByStudentId = new Map(
      snapshotStudents.map((student) => [
        student.studentId,
        student,
      ])
    );

    setStudents((currentStudents) =>
      currentStudents.map((student) => {
        const originalStudent =
          snapshotByStudentId.get(
            student.studentId
          );

        if (!originalStudent) return student;

        return {
          ...student,
          status: originalStudent.status,
          notes: originalStudent.notes,
        };
      })
    );

    setSuccessMessage("");
  }

  async function handleSaveAttendance() {
  if (
    !usuarioLogado?.id ||
    !Number.isInteger(normalizedClassId) ||
    normalizedClassId <= 0
  ) {
    return;
  }

  const normalizedSessionId =
    Number(selectedSessionId);

  if (
    !Number.isInteger(
      normalizedSessionId
    ) ||
    normalizedSessionId <= 0 ||
    !selectedSession
  ) {
    setError(
      "Selecione um encontro antes de registrar a frequência."
    );

    return;
  }

  if (!students.length) {
    setError(
      "Não existem alunos para registrar."
    );

    return;
  }

  try {
    setSaving(true);
    setError("");
    setSuccessMessage("");

    const payload = {
      sessionId: normalizedSessionId,

      records: students.map(
        (student) => ({
          studentId:
            student.studentId,

          status:
            student.status,

          notes:
            student.notes?.trim() ||
            "",
        })
      ),
    };

    

    const data = await apiFetch(
      `/api/teacher/by-user/${usuarioLogado.id}/classes/${normalizedClassId}/sessions/${selectedSessionId}/attendance`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    const returnedStudents =
      normalizeStudents(
        data?.students ||
          data?.records
      );

    const savedStudents =
      returnedStudents.length > 0
        ? returnedStudents
        : students.map(
            (student) => ({
              ...student,
              isSaved: true,
            })
          );

    setStudents(savedStudents);

    setInitialSnapshot(
      createStudentsSnapshot(
        savedStudents
      )
    );

    setClassData(
      (currentClassData) =>
        normalizeClassData(
          data?.class ||
            currentClassData
        )
    );

    setSuccessMessage(
      data?.message ||
        `Frequência do encontro ${selectedSession.sessionNumber} salva com sucesso.`
    );
  } catch (saveError) {
    console.error(
      "Erro ao salvar frequência:",
      saveError
    );

    setError(
      saveError?.message ||
        "Não foi possível salvar a frequência deste encontro."
    );
  } finally {
    setSaving(false);
  }
}

  if (
    !Number.isInteger(normalizedClassId) ||
    normalizedClassId <= 0
  ) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Turma inválida
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Não foi possível identificar a
              turma selecionada.
            </p>

            <Link
              to="/professor/turmas"
              className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Voltar para minhas turmas
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Link
              to="/professor/turmas"
              className="font-semibold text-slate-500 transition hover:text-blue-700"
            >
              Minhas turmas
            </Link>

            <span className="text-slate-300">
              /
            </span>

            {classData && (
              <>
                <Link
                  to={`/professor/turmas/${normalizedClassId}`}
                  className="font-semibold text-slate-500 transition hover:text-blue-700"
                >
                  {classData.name}
                </Link>

                <span className="text-slate-300">
                  /
                </span>
              </>
            )}

            <span className="font-semibold text-slate-800">
              Frequência
            </span>
          </div>

          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-600 mb-6">
                Gestão acadêmica
              </p>

              <h3 className="mt-2 text-sm font-semibold tracking-tight text-slate-900 sm:text-4xl">
                {classData
                  ? `Frequência — ${classData.name}`
                  : "Frequência da turma"}
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Registre presenças, ausências,
                atrasos e justificativas dos
                alunos.
              </p>
            </div>

           <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:w-[420px]">
                <div className="flex flex-col gap-4">
                    <div>
                        <label
                            htmlFor="attendance-session"
                            className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500"
                        >
                            Encontro da chamada
                        </label>

                        <select
                            id="attendance-session"
                            value={selectedSessionId}
                            disabled={
                            loadingSessions ||
                            saving ||
                            sessions.length === 0
                            }
                            onChange={handleSessionChange}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                            <option value="">
                            Selecione um encontro
                            </option>

                            {sessions.map((session) => (
                            <option
                                key={session.id}
                                value={session.id}
                            >
                                Encontro{" "}
                                {session.sessionNumber} —{" "}
                                {session.title}
                            </option>
                            ))}
                        </select>

                        <p className="mt-2 text-xs leading-5 text-slate-500">
                            Selecione o encontro antes de registrar ou consultar a frequência.
                        </p>
                     </div>

                        <button
                        type="button"
                        disabled={
                            loadingSessions ||
                            saving
                        }
                        onClick={openCreateSessionModal}
                        className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                        + Cadastrar encontro
                        </button>
                </div>
            </div>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{error}</span>

            <button
              type="button"
              disabled={loading}
              onClick={handleRetry}
              className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700"
          >
            {successMessage}
          </div>
        )}

       {!loading &&
        classData &&
        selectedSession && (
        <>
            <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">
                        Encontro{" "}
                        {selectedSession.sessionNumber}
                    </span>

                    <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${getSessionStatusClasses(
                        selectedSession.status
                        )}`}
                    >
                        {getSessionStatusLabel(
                        selectedSession.status
                        )}
                    </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
                    {selectedSession.title}
                    </h2>

                    {selectedSession.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {
                        selectedSession.description
                        }
                    </p>
                    )}
                </div>

                <div className="grid shrink-0 gap-3 rounded-2xl border border-blue-100 bg-white/80 p-4 text-sm sm:grid-cols-3 lg:grid-cols-1">
                    <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Data
                    </p>

                    <p className="mt-1 font-bold text-slate-700">
                        {formatSessionDate(
                        selectedSession.sessionDate
                        )}
                    </p>
                    </div>

                    <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Horário
                    </p>

                    <p className="mt-1 font-bold text-slate-700">
                        {formatSessionTime(
                        selectedSession.startTime,
                        selectedSession.endTime
                        )}
                    </p>
                    </div>

                    <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Tipo
                    </p>

                    <p className="mt-1 font-bold text-slate-700">
                        {getSessionTypeLabel(
                        selectedSession.sessionType
                        )}
                    </p>
                    </div>
                </div>
                </div>
            </section>

            <div className="mt-6">
                <AttendanceSummaryCard
                    classData={classData}
                    summary={summary}
                />
            </div>
        </>
      )}
        {loadingSessions && (
            <div className="mt-6 rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
                <p className="text-sm font-bold text-slate-700">
                Carregando encontros...
                </p>

                <p className="mt-2 text-sm text-slate-500">
                Aguarde enquanto buscamos os encontros desta turma.
                </p>
            </div>
        )}

        {!loadingSessions &&
        sessions.length === 0 && (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                📅
            </div>

            <h2 className="mt-5 text-xl font-black text-slate-900">
                Não há encontros disponíveis para realizar chamada
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                Cadastre um encontro para esta turma antes de registrar a frequência dos alunos.
            </p>

            <button
                type="button"
                onClick={openCreateSessionModal}
                className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
            >
                + Cadastrar encontro
            </button>
            </div>
        )}

        {!loadingSessions &&
        sessions.length > 0 &&
        !selectedSession && (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                    ✓
                </div>

                <h2 className="mt-5 text-xl font-black text-slate-900">
                    Selecione um encontro
                </h2>

                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                    Escolha no campo acima o encontro cuja chamada você deseja realizar ou consultar.
                </p>
            </div>
        )}

        {selectedSession && (
            <div className="mt-6">
                <AttendanceTable
                students={students}
                loading={loadingAttendance}
                disabled={saving}
                onStatusChange={
                    handleStatusChange
                }
                onNotesChange={
                    handleNotesChange
                }
                />
            </div>
        )}

        {selectedSession &&
            !loadingAttendance &&
            !error &&
            students.length === 0 && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="font-bold text-amber-800">
                    Nenhum aluno matriculado
                </p>

                <p className="mt-1 text-sm text-amber-700">
                    A turma ainda não possui alunos ativos para o registro de frequência neste encontro.
                </p>
                </div>
        )}

        {selectedSession &&
            !loadingAttendance &&
            students.length > 0 && (
          <footer className="sticky bottom-4 z-20 mt-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-200/50 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {canSave
                    ? "Existem registros não salvos"
                    : "Frequência atualizada"}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {canSave
                    ? `Salve para registrar os dados do encontro ${selectedSession.sessionNumber}.`
                    : "Nenhuma mudança pendente no momento."}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={
                    handleMarkAllPresent
                  }
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Marcar todos presentes
                </button>

                <button
                  type="button"
                  disabled={
                    !hasUnsavedChanges ||
                    saving
                  }
                  onClick={
                    handleResetChanges
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Descartar alterações
                </button>

                <button
                  type="button"
                  disabled={!canSave || saving}
                  onClick={
                    handleSaveAttendance
                  }
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving
                    ? "Salvando..."
                    : "Salvar frequência"}
                </button>
              </div>
            </div>
          </footer>
        )}
        <SessionModal
            open={isSessionModalOpen}
            classId={normalizedClassId}
            session={null}
            nextSessionNumber={nextSessionNumber}
            onClose={closeSessionModal}
            onSaved={handleSessionSaved}
        />
      </div>
    </main>
  );
}
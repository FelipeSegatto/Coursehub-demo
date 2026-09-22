import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import TeacherTable from "../../components/teachers/TeacherTable";
import TeacherStatusFilter from "../../components/teachers/TeacherStatusFilter";
import TableActionButton from "../../components/ui/actions/TableActionButton";

import StatusBadge from "../../components/ui/StatusBadge";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

const classStatusOptions = [
  {
    value: "",
    label: "Todas as turmas",
  },
  {
    value: "active",
    label: "Ativas",
  },
  {
    value: "inactive",
    label: "Inativas",
  },
  {
    value: "finished",
    label: "Concluídas",
  },
];

function formatDate(dateValue) {
  if (!dateValue) return "-";

  const datePart =
    String(dateValue).split("T")[0];

  const [year, month, day] =
    datePart.split("-");

  if (!year || !month || !day) {
    return "-";
  }

  return `${day}/${month}/${year}`;
}

function normalizeClassItem(classItem) {
  return {
    id: classItem.id,

    name:
      classItem.name ||
      `Turma #${classItem.id}`,

    courseId:
      classItem.courseId ??
      classItem.course_id ??
      null,

    teacherId:
      classItem.teacherId ??
      classItem.teacher_id ??
      null,

    courseName:
      classItem.courseName ??
      classItem.course_name ??
      "",

    courseDescription:
      classItem.courseDescription ??
      classItem.course_description ??
      "",

    courseImageUrl:
      classItem.courseImageUrl ??
      classItem.course_image_url ??
      null,

    courseCategory:
      classItem.courseCategory ??
      classItem.course_category ??
      "",

    courseLevel:
      classItem.courseLevel ??
      classItem.course_level ??
      "",

    shift:
      classItem.shift ?? "",

    startDate:
      classItem.startDate ??
      classItem.start_date ??
      null,

    endDate:
      classItem.endDate ??
      classItem.end_date ??
      null,

    status:
      classItem.status ?? "inactive",

    studentCount: Number(
      classItem.studentCount ??
        classItem.student_count ??
        0
    ),

    contentCount: Number(
      classItem.contentCount ??
        classItem.content_count ??
        0
    ),

    activityCount: Number(
      classItem.activityCount ??
        classItem.activity_count ??
        0
    ),

    attendancePercentage:
      classItem.attendancePercentage ??
      classItem.attendance_percentage ??
      null,

    createdAt:
      classItem.createdAt ??
      classItem.created_at ??
      null,

    updatedAt:
      classItem.updatedAt ??
      classItem.updated_at ??
      null,
  };
}

export default function TeacherClasses() {
  const { usuarioLogado } = useAuth();

  const [classes, setClasses] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("active");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function loadClasses() {
    if (!usuarioLogado?.id) {
      setClasses([]);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await apiFetch(
        `/api/teacher/by-user/${usuarioLogado.id}/classes`
      );

      const rawClasses =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.classes)
            ? data.classes
            : Array.isArray(data?.data)
              ? data.data
              : [];

      const normalizedClasses =
        rawClasses.map(
          normalizeClassItem
        );

      setClasses(normalizedClasses);
    } catch (loadError) {
      console.error(
        "Erro ao carregar turmas do professor:",
        loadError
      );

      setClasses([]);

      setError(
        loadError.message ||
          "Não foi possível carregar as turmas."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, [usuarioLogado?.id]);

  const filteredClasses =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return classes.filter(
        (classItem) => {
          const className =
            classItem.name
              ?.toLowerCase() || "";

          const courseName =
            classItem.courseName
              ?.toLowerCase() || "";

          const shift =
            classItem.shift
              ?.toLowerCase() || "";

          const matchesSearch =
            !normalizedSearch ||
            className.includes(
              normalizedSearch
            ) ||
            courseName.includes(
              normalizedSearch
            ) ||
            shift.includes(
              normalizedSearch
            );

          const matchesStatus =
            !statusFilter ||
            classItem.status ===
              statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      classes,
      search,
      statusFilter,
    ]);

  const stats = useMemo(() => {
    const activeClasses =
      classes.filter(
        (classItem) =>
          classItem.status ===
          "active"
      ).length;

    const totalStudents =
      classes.reduce(
        (total, classItem) =>
          total +
          Number(
            classItem.studentCount ||
              0
          ),
        0
      );

    const totalActivities =
      classes.reduce(
        (total, classItem) =>
          total +
          Number(
            classItem.activityCount ||
              0
          ),
        0
      );

    const classesWithAttendance =
      classes.filter(
        (classItem) =>
          classItem
            .attendancePercentage !==
            null &&
          classItem
            .attendancePercentage !==
            undefined
      );

    const averageAttendance =
      classesWithAttendance.length >
      0
        ? Math.round(
            classesWithAttendance.reduce(
              (
                total,
                classItem
              ) =>
                total +
                Number(
                  classItem
                    .attendancePercentage ||
                    0
                ),
              0
            ) /
              classesWithAttendance.length
          )
        : 0;

    return [
      {
        title: "Turmas ativas",
        value: activeClasses,
      },
      {
        title:
          "Alunos matriculados",
        value: totalStudents,
      },
      {
        title: "Atividades",
        value: totalActivities,
      },
      {
        title:
          "Frequência média",
        value:
          classesWithAttendance.length >
          0
            ? `${averageAttendance}%`
            : "-",
      },
    ];
  }, [classes]);

  const quickActions = [
    {
      title:
        "Gerenciar atividades",

      description:
        "Crie e acompanhe atividades das suas turmas.",

      to: "/professor/atividades",
    },
  ];

  const classColumns = [
    {
      key: "class",
      label: "Turma",
    },
    {
      key: "course",
      label: "Curso",
    },
    {
      key: "period",
      label: "Período",
    },
    {
      key: "students",
      label: "Alunos",
      align: "right",
    },
    {
      key: "status",
      label: "Status",
    },
    {
      key: "actions",
      label: "Ações",
      align: "right",
    },
  ];

  return (
    <ManagementPageShell
      backTo="/professor/dashboard-professor"
      title="Minhas turmas"
      description="Acompanhe suas turmas, alunos, atividades e registros de frequência."
      stats={stats}
      tableTitle="Turmas atribuídas"
      tableActions={
        <TeacherStatusFilter
          value={statusFilter}
          onChange={
            setStatusFilter
          }
          options={
            classStatusOptions
          }
        />
      }
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar turma, curso ou horário..."
      quickActions={quickActions}
    >
      {loading && (
        <p className="py-8 text-center text-gray-500">
          Carregando turmas...
        </p>
      )}

      {!loading && error && (
        <div className="py-8 text-center">
          <p className="text-red-500">
            {error}
          </p>

          <button
            type="button"
            onClick={loadClasses}
            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !error && (
        <TeacherTable
          columns={classColumns}
          data={filteredClasses}
          emptyMessage="Nenhuma turma encontrada."
          renderRow={(
            classItem
          ) => (
            <tr
              key={classItem.id}
              className="border-b border-gray-100"
            >
              <td className="px-3 py-3">
                <p className="text-sm font-semibold text-gray-900">
                  {classItem.name}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Turma #
                  {classItem.id}
                </p>

                {classItem.shift && (
                  <p className="mt-1 text-xs capitalize text-gray-500">
                    {classItem.shift}
                  </p>
                )}
              </td>

              <td className="px-3 py-3">
                <p className="text-sm font-medium text-gray-700">
                  {classItem.courseName ||
                    (classItem.courseId
                      ? `Curso #${classItem.courseId}`
                      : "Curso não informado")}
                </p>

                {classItem.courseLevel && (
                  <p className="mt-1 text-xs text-gray-400">
                    Nível:{" "}
                    {
                      classItem.courseLevel
                    }
                  </p>
                )}
              </td>

              <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                <p>
                  {formatDate(
                    classItem.startDate
                  )}
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  até{" "}
                  {formatDate(
                    classItem.endDate
                  )}
                </p>
              </td>

              <td className="whitespace-nowrap px-3 py-3 text-right">
                <p className="text-sm font-semibold tabular-nums text-gray-800">
                  {
                    classItem.studentCount
                  }
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  matriculados
                </p>
              </td>

              <td className="whitespace-nowrap px-3 py-3">
                <StatusBadge
                  status={
                    classItem.status
                  }
                />
              </td>

              <td className="whitespace-nowrap px-3 py-3">
                <div className="flex justify-end gap-2">
                  <TableActionButton
                    variant="accent"
                    size="sm"
                    to={`/professor/turmas/${classItem.id}`}
                  >
                    Abrir turma
                  </TableActionButton>

                  <TableActionButton
                    variant="neutral"
                    size="sm"
                    to={`/professor/turmas/${classItem.id}/frequencia`}
                  >
                    Frequência
                  </TableActionButton>

                  <TableActionButton
                    variant="neutral"
                    size="sm"
                    to={`/professor/turmas/${classItem.id}/materiais`}
                  >
                    Materiais
                  </TableActionButton>
                </div>
              </td>
            </tr>
          )}
          renderMobileCard={(classItem) => (
            <MobileExpandableCard
              key={classItem.id}
              title={classItem.name}
              subtitle={`Turma #${classItem.id}`}
              badge={<StatusBadge status={classItem.status} size="sm" />}
              primaryAction={
                <TableActionButton
                  variant="accent"
                  size="md"
                  className="w-full"
                  to={`/professor/turmas/${classItem.id}`}
                >
                  Abrir turma
                </TableActionButton>
              }
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Curso</span>
                <span className="font-medium text-gray-900">
                  {classItem.courseName ||
                    (classItem.courseId
                      ? `Curso #${classItem.courseId}`
                      : "Curso não informado")}
                </span>
              </div>

              {classItem.shift && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Turno</span>
                  <span className="font-medium capitalize text-gray-900">
                    {classItem.shift}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Período</span>
                <span className="font-medium text-gray-900">
                  {formatDate(classItem.startDate)} até{" "}
                  {formatDate(classItem.endDate)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Alunos matriculados</span>
                <span className="font-medium text-gray-900">
                  {classItem.studentCount}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <TableActionButton
                  variant="neutral"
                  size="sm"
                  className="flex-1"
                  to={`/professor/turmas/${classItem.id}/frequencia`}
                >
                  Frequência
                </TableActionButton>

                <TableActionButton
                  variant="neutral"
                  size="sm"
                  className="flex-1"
                  to={`/professor/turmas/${classItem.id}/materiais`}
                >
                  Materiais
                </TableActionButton>
              </div>
            </MobileExpandableCard>
          )}
        />
      )}
    </ManagementPageShell>
  );
}
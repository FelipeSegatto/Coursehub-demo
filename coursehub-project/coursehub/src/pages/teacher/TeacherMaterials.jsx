import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import ContentModal from "../../components/teachers/ContentModal";
import DeleteModal from "../../components/teachers/DeleteModal";
import TeacherTable from "../../components/teachers/TeacherTable";
import TeacherStatusFilter from "../../components/teachers/TeacherStatusFilter";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import StatusBadge from "../../components/ui/StatusBadge";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

const contentStatusOptions = [
  {
    value: "",
    label: "Todos",
  },
  {
    value: "active",
    label: "Ativos",
  },
  {
    value: "inactive",
    label: "Inativos",
  },
  {
    value: "draft",
    label: "Rascunhos",
  },
  {
    value: "archived",
    label: "Arquivados",
  },
];

const contentTypeLabels = {
  video: "Videoaula",
  pdf: "PDF / Apostila",
  text: "Conteúdo em texto",
  live_class: "Aula ao vivo",
};

export default function TeacherMaterials() {
  const { usuarioLogado } = useAuth();

  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [allContents, setAllContents] = useState([]);

  const [selectedContent, setSelectedContent] =
    useState(null);

  const [
    selectedContentToDelete,
    setSelectedContentToDelete,
  ] = useState(null);

  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("active");
  const [courseFilter, setCourseFilter] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [modalMode, setModalMode] =
    useState("create");

  const [deleteModalOpen, setDeleteModalOpen] =
    useState(false);

  const [loadingDelete, setLoadingDelete] =
    useState(false);

  /*
   * Busca os conteúdos dos cursos do professor.
   */
  async function loadContents() {
  if (!usuarioLogado?.id) return;

  const endpoint =
    `/api/teacher/by-user/${usuarioLogado.id}/course-contents`;

  console.log(
    "Buscando conteúdos do professor:",
    endpoint
  );

  const data = await apiFetch(endpoint);

  console.log(
    "Resposta da busca de conteúdos:",
    data
  );

  const contentList = Array.isArray(data)
    ? data
    : Array.isArray(data?.contents)
      ? data.contents
      : Array.isArray(data?.data)
        ? data.data
        : [];

  setAllContents(contentList);
}

  /*
   * Busca os cursos do professor.
   */
  async function loadCourses() {
  if (!usuarioLogado?.id) return;

  const endpoint =
    `/api/teacher/by-user/${usuarioLogado.id}/courses`;

  console.log(
    "Buscando cursos do professor:",
    endpoint
  );

  const data = await apiFetch(endpoint);

  console.log(
    "Resposta da busca de cursos:",
    data
  );

  const courseList = Array.isArray(data)
    ? data
    : Array.isArray(data?.courses)
      ? data.courses
      : Array.isArray(data?.data)
        ? data.data
        : [];

  setCourses(courseList);
}

  /*
   * Busca as turmas do professor, usadas para
   * linkar cada conteúdo à sua turma no botão "Ver".
   */
  async function loadClasses() {
  if (!usuarioLogado?.id) return;

  const endpoint =
    `/api/teacher/by-user/${usuarioLogado.id}/classes`;

  const data = await apiFetch(endpoint);

  const classList = Array.isArray(data)
    ? data
    : Array.isArray(data?.classes)
      ? data.classes
      : Array.isArray(data?.data)
        ? data.data
        : [];

  setClasses(classList);
}

  /*
   * Retorna a primeira turma do professor associada
   * ao curso do conteúdo, ou null se não houver turma.
   */
  function findClassForCourse(courseId) {
    if (!courseId) return null;

    return (
      classes.find(
        (classItem) =>
          Number(classItem.courseId ?? classItem.course_id) ===
          Number(courseId)
      ) || null
    );
  }

  /*
   * Botão "Ver" -- compartilhado entre a linha desktop e o card
   * mobile para não duplicar (e desalinhar) a lógica de resolução
   * de turma.
   */
  function renderViewButton(content, size = "sm") {
    const specificClassId = content.classId ?? content.class_id ?? null;

    /*
     * Conteúdo específico: navega exatamente para a
     * turma dona do conteúdo — nunca para outra.
     */
    if (specificClassId) {
      return (
        <TableActionButton
          variant="neutral"
          size={size}
          to={`/professor/turmas/${specificClassId}/materiais`}
        >
          Ver
        </TableActionButton>
      );
    }

    /*
     * Conteúdo geral: não pertence a uma turma
     * específica, então é uma escolha de contexto
     * abrir na primeira turma disponível do curso.
     */
    const fallbackClass = findClassForCourse(content.course_id);

    if (!fallbackClass) {
      return (
        <TableActionButton
          variant="neutral"
          size={size}
          disabled
          title="Nenhuma turma cadastrada para este curso."
        >
          Ver
        </TableActionButton>
      );
    }

    return (
      <TableActionButton
        variant="neutral"
        size={size}
        to={`/professor/turmas/${fallbackClass.id}/materiais`}
        title="Conteúdo geral do curso. Abrir na primeira turma disponível."
      >
        Ver
      </TableActionButton>
    );
  }

  /*
   * Carrega cursos, turmas e conteúdos ao abrir a página.
   */
  useEffect(() => {
    if (!usuarioLogado?.id) return;

    async function fetchTeacherData() {
      try {
        setLoading(true);
        setError("");

        await Promise.all([
          loadContents(),
          loadCourses(),
          loadClasses(),
        ]);
      } catch (error) {
        console.error(
          "Erro ao carregar dados da página de materiais:",
          {
            message: error.message,
            stack: error.stack,
            userId: usuarioLogado?.id,
          }
        );

        setError(
          error.message ||
            "Erro ao carregar os dados da página."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchTeacherData();
  }, [usuarioLogado?.id]);

  /*
   * Abre o modal no modo de criação.
   */
  function handleCreateClick() {
    console.log(
      "Abrindo modal para criar conteúdo."
    );

    setModalMode("create");
    setSelectedContent(null);
    setModalOpen(true);
  }

  /*
   * Abre o modal no modo de edição.
   */
  function handleEditClick(content) {
    console.log(
      "Abrindo modal para editar conteúdo:",
      content
    );

    if (!content?.id) {
      console.error(
        "Não foi possível abrir a edição: conteúdo sem ID.",
        content
      );

      setError(
        "Não foi possível identificar o conteúdo selecionado."
      );

      return;
    }

    setModalMode("edit");
    setSelectedContent(content);
    setModalOpen(true);
  }

  /*
   * Fecha e limpa o modal.
   */
  function handleCloseModal() {
    console.log(
      "Fechando modal de conteúdo."
    );

    setModalOpen(false);
    setSelectedContent(null);
    setModalMode("create");
  }

  /*
   * Recarrega a listagem após criação ou edição.
   */
  async function handleContentSuccess(savedContent) {
    console.log(
      "Conteúdo criado ou atualizado:",
      savedContent
    );

    try {
      setError("");

      await loadContents();

      handleCloseModal();
    } catch (error) {
      console.error(
        "Erro ao recarregar conteúdos após salvar:",
        {
          message: error.message,
          stack: error.stack,
          savedContent,
        }
      );

      setError(
        error.message ||
          "O conteúdo foi salvo, mas a listagem não pôde ser atualizada."
      );
    }
  }

  /*
   * Abre o modal de exclusão.
   */
  function handleDeleteClick(content) {
    console.log(
      "Abrindo confirmação de exclusão:",
      content
    );

    if (!content?.id) {
      console.error(
        "Não foi possível abrir o delete: conteúdo sem ID.",
        content
      );

      setError(
        "Não foi possível identificar o conteúdo selecionado."
      );

      return;
    }

    setSelectedContentToDelete(content);
    setDeleteModalOpen(true);
  }

  /*
   * Fecha o modal de exclusão.
   */
  function handleCloseDeleteModal() {
    if (loadingDelete) {
      console.warn(
        "Fechamento ignorado: exclusão em andamento."
      );

      return;
    }

    setSelectedContentToDelete(null);
    setDeleteModalOpen(false);
  }

  /*
   * Realiza o soft delete do conteúdo e registra
   * informações detalhadas no console.
   */
  async function handleDeleteContent(item) {
    if (!item?.id) {
      console.error(
        "Delete cancelado: conteúdo sem ID.",
        item
      );

      setError(
        "Não foi possível identificar o conteúdo para exclusão."
      );

      return;
    }

    if (loadingDelete) {
      console.warn(
        "Delete ignorado: já existe uma exclusão em andamento.",
        item
      );

      return;
    }

    const endpoint =
  `/api/course-contents/${item.id}`;

    try {
      setLoadingDelete(true);
      setError("");

      console.log(
        "Iniciando exclusão de conteúdo:",
        {
          endpoint,
          method: "DELETE",
          item,
        
        }
      );

      const data = await apiFetch(endpoint, {
        method: "DELETE",
      });

      console.log(
        "Resposta do DELETE:",
        data
      );

      const updatedStatus =
        data?.status ||
        data?.content?.status ||
        data?.course_content?.status ||
        "archived";

      /*
       * O backend utiliza soft delete.
       *
       * O registro permanece no estado local, mas
       * recebe o novo status.
       */
      setAllContents((previousContents) =>
        previousContents.map(
          (currentContent) =>
            currentContent.id === item.id
              ? {
                  ...currentContent,
                  status: updatedStatus,
                }
              : currentContent
        )
      );

      console.log(
        "Conteúdo atualizado localmente após soft delete:",
        {
          id: item.id,
          status: updatedStatus,
        }
      );

      setSelectedContentToDelete(null);
      setDeleteModalOpen(false);
    } catch (error) {
      console.error(
        "Erro completo ao excluir conteúdo:",
        {
          message: error.message,
          stack: error.stack,
          item,
          endpoint,
          userId: usuarioLogado?.id,
        }
      );

      setError(
        error.message ||
          "Erro ao excluir conteúdo."
      );
    } finally {
      setLoadingDelete(false);
    }
  }

  const filteredContents = useMemo(() => {
    const term = busca.trim().toLowerCase();

    return allContents.filter((content) => {
      const title =
        content.title?.toLowerCase() || "";

      const type =
        content.type?.toLowerCase() || "";

      const courseName =
        content.course_name?.toLowerCase() ||
        content.course_title?.toLowerCase() ||
        "";

      const status =
        content.status?.toLowerCase() || "";

      const matchesSearch =
        !term ||
        title.includes(term) ||
        type.includes(term) ||
        courseName.includes(term) ||
        status.includes(term);

      const matchesStatus =
        !statusFilter ||
        content.status === statusFilter;

      const contentCourseId =
        content.course_id ?? content.courseId;

      const matchesCourse =
        !courseFilter ||
        Number(contentCourseId) === Number(courseFilter);

      return matchesSearch && matchesStatus && matchesCourse;
    });
  }, [
    allContents,
    busca,
    statusFilter,
    courseFilter,
  ]);

  const stats = useMemo(() => {
    return [
      {
        title: "Total de conteúdos",
        value: allContents.length,
      },
      {
        title: "Conteúdos ativos",
        value: allContents.filter(
          (content) =>
            content.status === "active"
        ).length,
      },
      {
        title: "Rascunhos/Inativos",
        value: allContents.filter(
          (content) =>
            content.status === "draft" ||
            content.status === "inactive"
        ).length,
      },
      {
        title: "Conteúdos em vídeo",
        value: allContents.filter(
          (content) =>
            content.type === "video"
        ).length,
      },
    ];
  }, [allContents]);

  const quickActions = [
    {
      title: "Cadastrar material",
      description:
        "Adicione uma videoaula, PDF, texto ou aula ao vivo.",
      onClick: handleCreateClick,
    },
    {
      title: "Acompanhar progresso",
      description:
        "Acompanhe o consumo dos conteúdos pelos alunos.",
      disabled: true,
      disabledReason: "Funcionalidade em desenvolvimento.",
    },
  ];

  const columns = [
    {
      key: "content",
      label: "Materiais e conteúdos",
    },
    {
      key: "course",
      label: "Curso",
    },
    {
      key: "class",
      label: "Turma",
    },
    {
      key: "category",
      label: "Tipo",
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
    <>
      <ManagementPageShell
        backTo="/professor/dashboard-professor"
        title="Gerenciamento de materiais, aulas e conteúdos"
        description="Acompanhe conteúdos cadastrados, materiais e aulas."
        createButtonText="+ Novo Material / Aula"
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle="Lista de aulas e materiais"
        tableActions={
          <MobileFilterToggle
            activeCount={[courseFilter, statusFilter].filter(Boolean).length}
          >
            {courses.length > 1 && (
              <select
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                aria-label="Filtrar por curso"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
              >
                <option value="">Todos os cursos</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            )}

            <TeacherStatusFilter
              value={statusFilter}
              onChange={setStatusFilter}
              options={contentStatusOptions}
            />
          </MobileFilterToggle>
        }
        searchValue={busca}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar conteúdo..."
        quickActions={quickActions}
      >
        {loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando conteúdos...
          </p>
        )}

        {!loading && error && (
          <p className="py-6 text-center text-red-500">
            {error}
          </p>
        )}

        {!loading && !error && (
          <TeacherTable
            columns={columns}
            data={filteredContents}
            emptyMessage="Nenhum conteúdo encontrado."
            renderRow={(content) => (
              <tr
                key={content.id}
                className="border-b border-gray-100"
              >
                <td className="px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {content.title}
                  </p>

                  {content.description && (
                    <p className="mt-1 max-w-md truncate text-xs text-gray-500">
                      {content.description}
                    </p>
                  )}
                </td>

                <td className="px-3 py-3 text-sm text-gray-600">
                  {content.course_name ||
                    content.course_title ||
                    `Curso #${content.course_id}`}
                </td>

                <td className="px-3 py-3 text-sm text-gray-600">
                  {content.classId ?? content.class_id
                    ? content.className ||
                      content.class_name ||
                      `Turma #${content.classId ?? content.class_id}`
                    : "Todas as turmas"}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                  {contentTypeLabels[
                    content.type
                  ] ||
                    content.type ||
                    "-"}
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge
                    status={content.status}
                  />
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {renderViewButton(content)}

                    <TableActionButton
                      variant="accent"
                      size="sm"
                      onClick={() =>
                        handleEditClick(content)
                      }
                    >
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "remove",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(content),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )}
            renderMobileCard={(content) => (
              <MobileExpandableCard
                key={content.id}
                title={content.title}
                subtitle={content.description}
                badge={<StatusBadge status={content.status} size="sm" />}
                primaryAction={
                  <div className="flex items-center gap-2">
                    <TableActionButton
                      variant="accent"
                      size="md"
                      className="flex-1"
                      onClick={() => handleEditClick(content)}
                    >
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "remove",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(content),
                        },
                      ]}
                    />
                  </div>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Curso</span>
                  <span className="font-medium text-gray-900">
                    {content.course_name ||
                      content.course_title ||
                      `Curso #${content.course_id}`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Turma</span>
                  <span className="font-medium text-gray-900">
                    {content.classId ?? content.class_id
                      ? content.className ||
                        content.class_name ||
                        `Turma #${content.classId ?? content.class_id}`
                      : "Todas as turmas"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Tipo</span>
                  <span className="font-medium text-gray-900">
                    {contentTypeLabels[content.type] || content.type || "-"}
                  </span>
                </div>

                <div className="pt-1">{renderViewButton(content, "sm")}</div>
              </MobileExpandableCard>
            )}
          />
        )}
      </ManagementPageShell>

      {modalOpen && (
        <ContentModal
          variant="content"
          mode={modalMode}
          courses={courses}
          classes={classes}
          content={selectedContent}
          userId={usuarioLogado.id}
          handleCloseModal={handleCloseModal}
          onSuccess={handleContentSuccess}
        />
      )}

      {deleteModalOpen && (
        <DeleteModal
          item={selectedContentToDelete}
          variant="content"
          loading={loadingDelete}
          handleCloseModal={
            handleCloseDeleteModal
          }
          onConfirm={handleDeleteContent}
        />
      )}
    </>
  );
}
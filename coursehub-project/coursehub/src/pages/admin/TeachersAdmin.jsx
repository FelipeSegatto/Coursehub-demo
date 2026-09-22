import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../../services/APIService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminCreateEditModal from "../../components/admin/AdminCreateEditModal";
import DeleteConfirmModal from "../../components/admin/AdminDeleteModal";
import AdminTable from "../../components/admin/AdminTable";
import AdminStatusFilter from "../../components/admin/AdminStatusFilter";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

import StatusBadge from "../../components/ui/StatusBadge";

export default function TeachersAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [teachers, setTeachers] = useState([]);
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "active");
  const teacherStatusOptions = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

  // Ex.: deep link do dashboard (/admin/professores?status=active) --
  // filtragem já é imediata (useMemo abaixo), então só precisa manter
  // a URL sincronizada para sobreviver a um refresh.
  useEffect(() => {
    setSearchParams(statusFilter ? { status: statusFilter } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchTeachers() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/api/admin/teachers");
      setTeachers(Array.isArray(data) ? data : []);
    } catch (error) {
      setError(error.message || "Erro ao buscar professores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTeachers();
  }, []);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedTeacher(null);
    setModalOpen(true);
  }

  function handleEditClick(teacher) {
    setModalMode("edit");
    setSelectedTeacher(teacher);
    setModalOpen(true);
  }

  function handleDeleteClick(teacher) {
    setSelectedTeacher(teacher);
    setDeleteModalOpen(true);
  }

  async function handleConfirmDelete() {
    if (!selectedTeacher?.id) return;

    try {
      setLoadingDelete(true);

      await apiFetch(`/api/admin/teachers/${selectedTeacher.id}`, {
        method: "DELETE",
      });

      setDeleteModalOpen(false);
      setSelectedTeacher(null);
      fetchTeachers();
    } catch (error) {
      alert(error.message || "Erro ao remover professor.");
    } finally {
      setLoadingDelete(false);
    }
  }

  const filteredTeachers = useMemo(() => {
  const term = busca.trim().toLowerCase();

  return teachers.filter((teacher) => {
    const matchesSearch =
      !term ||
      teacher.name?.toLowerCase().includes(term) ||
      teacher.registration_number?.toLowerCase().includes(term) ||
      teacher.course_names?.toLowerCase().includes(term);

    const matchesStatus =
      !statusFilter ||
      teacher.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
}, [teachers, busca, statusFilter]);

  const stats = useMemo(() => {
    return [
      { title: "Total de professores", value: teachers.length },
      {
        title: "Professores ativos",
        value: teachers.filter((teacher) => teacher.status === "active").length,
      },
      {
        title: "Inativos",
        value: teachers.filter((teacher) => teacher.status === "inactive").length,
      },
         {
      title: "Cursos vinculados",
      value: teachers.reduce(
        (total, teacher) => total + Number(teacher.total_courses || 0),
        0
      ),
    },
    ];
  }, [teachers]);

  const quickActions = [
    {
      title: "Cadastrar professor",
      description: "Adicione um novo professor à plataforma.",
      onClick: handleCreateClick,
    },
    {
      title: "Acompanhar métricas do professor",
      description: "Veja o desempenho dos cursos vinculados aos professores.",
      disabled: true,
      disabledReason: "Funcionalidade em desenvolvimento.",
    },
  ];

    const columns = [
    { key: "teacher", label: "Professor" },
    { key: "registration_number", label: "Matrícula" },
    { key: "course_names", label: "Cursos" },
    { key: "phone", label: "Telefone" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Gerenciamento de professores"
        description="Acompanhe professores cadastrados, cursos, status e progresso."
        createButtonText="+ Novo professor"
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle="Lista de professores"
        tableActions={
          <AdminStatusFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={teacherStatusOptions}
          />
        }
        searchValue={busca}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar professor..."
        quickActions={quickActions}
      >
        {loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando professores...
          </p>
        )}

        {!loading && error && (
          <p className="py-6 text-center text-red-500">{error}</p>
        )}

        {!loading && !error && (
          <AdminTable
            columns={columns}
            data={filteredTeachers}
            emptyMessage="Nenhum professor encontrado."
            renderRow={(teacher) => (
              <tr key={teacher.id} className="border-b border-gray-100">
                <td className="px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">{teacher.name}</p>
                  <p className="text-xs text-gray-500">{teacher.email}</p>
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                  {teacher.registration_number || "-"}
                </td>

                <td className="px-3 py-3 text-sm text-gray-600">{teacher.course_names || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{teacher.phone || "-"}</td>

                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge status={teacher.status} />
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center justify-end gap-2">


                    <TableActionButton variant="accent" size="sm" onClick={() => handleEditClick(teacher)}>
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "delete",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(teacher),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )}
            renderMobileCard={(teacher) => (
              <MobileExpandableCard
                key={teacher.id}
                title={teacher.name}
                subtitle={teacher.email}
                badge={<StatusBadge status={teacher.status} size="sm" />}
                primaryAction={
                  <div className="flex items-center gap-2">
                    <TableActionButton
                      variant="accent"
                      size="md"
                      className="flex-1"
                      onClick={() => handleEditClick(teacher)}
                    >
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "delete",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(teacher),
                        },
                      ]}
                    />
                  </div>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Matrícula</span>
                  <span className="font-medium text-gray-900">
                    {teacher.registration_number || "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Cursos</span>
                  <span className="font-medium text-gray-900">
                    {teacher.course_names || "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Telefone</span>
                  <span className="font-medium text-gray-900">{teacher.phone || "-"}</span>
                </div>
              </MobileExpandableCard>
            )}
          />
        )}
      </ManagementPageShell>

      {modalOpen && (
        <AdminCreateEditModal
          variant="teacher"
          mode={modalMode}
          initialData={selectedTeacher}
          handleCloseModal={() => setModalOpen(false)}
          onSuccess={fetchTeachers}
        />
      )}

      {deleteModalOpen && (
        <DeleteConfirmModal
          title="Remover professor"
          description="Tem certeza que deseja remover este professor?"
          itemName={selectedTeacher?.name}
          loading={loadingDelete}
          onCancel={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}


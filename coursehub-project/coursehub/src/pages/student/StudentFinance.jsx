import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../services/APIService";

import FinanceCourseFilter from "../../components/finance/FinanceCourseFilter";
import AllCoursesFinanceView from "../../components/finance/views/AllCoursesFinanceView";
import CourseFinanceView from "../../components/finance/views/CourseFinanceView";




export default function StudentFinance() {
  const [financeData, setFinanceData] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  

  useEffect(() => {
    let cancelled = false;

    async function fetchFinanceData() {
      try {
        setLoading(true);
        setError("");

        const data = await apiFetch("/api/student/finance");

        if (!cancelled) setFinanceData(data);
      } catch (error) {
        console.error("Erro ao carregar dados financeiros:", error);

        if (!cancelled) {
          setError(
            error.message || "Não foi possível carregar seus dados financeiros."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFinanceData();

    return () => {
      cancelled = true;
    };
  }, []);

  // O webhook é a fonte real da verdade para "esta fatura agora está
  // paga" -- este refetch é só para UX, disparado assim que o
  // próprio polling do modal de pagamento observa uma aprovação,
  // para que as listas de fatura/pagamento reflitam isso sem o aluno
  // precisar recarregar a página.
  async function handlePaymentApproved() {
    try {
      const data = await apiFetch("/api/student/finance");

      setFinanceData(data);
    } catch (error) {
      console.error("Erro ao atualizar dados financeiros após pagamento:", error);
    }
  }

  const courses = useMemo(() => {
    if (!financeData?.contracts) {
      return [];
    }

    const coursesMap = new Map();

    financeData.contracts.forEach((contract) => {
      if (!contract.courseId) {
        return;
      }

      coursesMap.set(contract.courseId, {
        id: contract.courseId,
        name: contract.courseName,
      });
    });

    return Array.from(coursesMap.values()).sort((courseA, courseB) =>
      courseA.name.localeCompare(courseB.name, "pt-BR")
    );
  }, [financeData]);

  const selectedCourseData = useMemo(() => {
    if (selectedCourseId === "all" || !financeData) {
      return null;
    }

    const courseId = Number(selectedCourseId);

    return {
      contract:
        financeData.contracts?.find(
          (contract) => Number(contract.courseId) === courseId
        ) || null,

      invoices:
        financeData.invoices?.filter(
          (invoice) => Number(invoice.courseId) === courseId
        ) || [],

      payments:
        financeData.payments?.filter(
          (payment) => Number(payment.courseId) === courseId
        ) || [],
    };
  }, [financeData, selectedCourseId]);

  const isAllCourses = selectedCourseId === "all";

  if (loading) {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-500">
          Carregando informações financeiras...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-medium text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!financeData) {
    return null;
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Área do aluno</p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            Financeiro
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Consulte contratos, cobranças e pagamentos relacionados aos seus
            cursos.
          </p>
        </div>

        <FinanceCourseFilter
          courses={courses}
          value={selectedCourseId}
          onChange={setSelectedCourseId}
        />
      </header>

      {isAllCourses ? (
        <AllCoursesFinanceView
            summary={financeData.summary}
            overdueInvoice={financeData.overdueInvoice}
            nextInvoice={financeData.nextInvoice}
            invoices={financeData.invoices}
            contracts={financeData.contracts}
            onPaymentApproved={handlePaymentApproved}
        />
      ) : (
        <CourseFinanceView
          courseData={selectedCourseData}
          selectedCourseId={Number(selectedCourseId)}
          onPaymentApproved={handlePaymentApproved}
        />
      )}
    </main>
  );
}
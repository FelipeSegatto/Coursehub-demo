const QRCODE = require("qrcode");

const financialContract = require("../../services/documents/templates/financial/financialContractDocumentTemplate");
const invoiceCopy = require("../../services/documents/templates/financial/invoiceCopyDocumentTemplate");
const paymentReceipt = require("../../services/documents/templates/financial/paymentReceiptDocumentTemplate");
const enrollmentDeclaration = require("../../services/documents/templates/academic/enrollmentDeclarationTemplate");
const attendanceDeclaration = require("../../services/documents/templates/academic/attendanceDeclarationTemplate");
const completionDeclaration = require("../../services/documents/templates/academic/completionDeclarationTemplate");
const certificate = require("../../services/documents/templates/academic/certificateTemplate");
const { renderContractTermsDocument } = require("../../services/financial/contractTermsTemplate");
const studentProgress = require("../../services/reports/templates/studentProgressPdfTemplate");
const gradesReport = require("../../services/reports/templates/gradesReportTemplate");
const attendanceReport = require("../../services/reports/templates/attendanceReportTemplate");
const enrollmentsReport = require("../../services/reports/templates/enrollmentsReportTemplate");
const academicProgressReport = require("../../services/reports/templates/academicProgressReportTemplate");
const invoicesReport = require("../../services/reports/templates/financialInvoicesReportTemplate");

const VERIFICATION_URL = "http://localhost:5173/documentos/verificar/LAB-ABC123";

const CONTRACT_SNAPSHOT = {
  contract: {
    id: 1001,
    planName: "Plano anual React",
    billingType: "monthly_plan",
    totalAmount: 2400,
    monthlyPaymentCount: 12,
    monthlyPaymentAmount: 200,
    startDate: "2026-09-01",
    createdAt: "2026-09-01T12:00:00Z",
    activatedAt: "2026-09-01T12:05:00Z",
    stage: "active",
  },
  course: { name: "React do Zero" },
  contractingParty: {
    name: "Ana Souza",
    partyType: "individual",
    document: "52998224725",
    email: "ana@example.com",
    phone: "11999999999",
    address: { line: "Rua Augusta, 100", city: "São Paulo", state: "SP", zipCode: "01310-100" },
  },
  student: {
    name: "Ana Souza",
    document: "52998224725",
    email: "ana@example.com",
    birthDate: "1998-04-12",
  },
  firstInvoice: { amount: 200, dueDate: "2026-09-10", description: "1ª mensalidade" },
};

const REPORT_META = {
  filterLines: ["Laboratório de documentos", "Dados de fixture (não é o banco da escola)"],
  requestedByName: "Laboratório CourseHub",
  generatedAt: new Date("2026-09-18T15:00:00Z"),
  rowCap: 500,
};

async function buildCatalog() {
  const verificationQrDataUri = await QRCODE.toDataURL(VERIFICATION_URL, {
    margin: 1,
    width: 160,
  });

  const academicBase = {
    student: { name: "Ana Souza", document: "52998224725" },
    course: { name: "React do Zero", workloadHours: 40 },
    verificationQrDataUri,
    verificationCode: "LAB-ABC123",
    issuedAt: "2026-09-18",
  };

  return [
    {
      id: "financial_contract",
      group: "Oficiais",
      title: "Contrato financeiro",
      render: () => financialContract.render(CONTRACT_SNAPSHOT),
    },
    {
      id: "invoice_copy",
      group: "Oficiais",
      title: "2ª via de fatura",
      render: () =>
        invoiceCopy.render({
          invoice: {
            id: 88,
            description: "Mensalidade setembro",
            originalAmount: 200,
            amount: 200,
            discountAmount: 0,
            dueDate: "2026-09-10",
            status: "pending",
            paidAt: null,
          },
          contract: { id: 1001, planName: "Plano anual React" },
          course: { name: "React do Zero" },
          contractingParty: { name: "Ana Souza", email: "ana@example.com" },
          student: { name: "Ana Souza" },
        }),
    },
    {
      id: "payment_receipt",
      group: "Oficiais",
      title: "Recibo de pagamento",
      render: () =>
        paymentReceipt.render({
          payment: {
            id: 44,
            amount: 200,
            currency: "BRL",
            paidAt: "2026-09-10T12:00:00Z",
            paymentMethod: "pix",
            safeReference: "PIX-LAB-44",
          },
          invoice: { id: 88, description: "Mensalidade setembro" },
          contract: { id: 1001, planName: "Plano anual React" },
          course: { name: "React do Zero" },
          payer: { name: "Ana Souza", document: "52998224725", email: "ana@example.com" },
        }),
    },
    {
      id: "enrollment_declaration",
      group: "Oficiais",
      title: "Declaração de matrícula",
      render: () =>
        enrollmentDeclaration.render({
          ...academicBase,
          enrollment: { status: "active", enrolledAt: "2026-09-01" },
        }),
    },
    {
      id: "attendance_declaration",
      group: "Oficiais",
      title: "Declaração de frequência",
      render: () =>
        attendanceDeclaration.render({
          ...academicBase,
          period: { start: "2026-08-01", end: "2026-08-31" },
          attendance: { totalSessions: 8, presentSessions: 7, rate: 87.5 },
        }),
    },
    {
      id: "completion_declaration",
      group: "Oficiais",
      title: "Declaração de conclusão",
      render: () =>
        completionDeclaration.render({
          ...academicBase,
          enrollment: { completedAt: "2026-09-01" },
          eligibility: {
            requirements: [{ label: "Frequência", required: "75%", actual: "90%" }],
          },
        }),
    },
    {
      id: "certificate",
      group: "Oficiais",
      title: "Certificado",
      render: () =>
        certificate.render({
          student: { name: "Ana Souza" },
          course: { name: "React do Zero", workloadHours: 40 },
          completedAt: "2026-09-01",
          verificationUrl: VERIFICATION_URL,
          verificationQrDataUri,
          verificationCode: "LAB-ABC123",
        }),
    },
    {
      id: "contract_terms",
      group: "Termos",
      title: "Termos do contrato (HTML congelado)",
      render: () => renderContractTermsDocument(CONTRACT_SNAPSHOT),
    },
    {
      id: "student_progress",
      group: "Relatórios",
      title: "Progresso do aluno",
      render: () =>
        studentProgress.render({
          requestedByName: REPORT_META.requestedByName,
          generatedAt: REPORT_META.generatedAt,
          detail: {
            enrollment: {
              status: "active",
              enrolledAt: "2026-09-01",
              student: { name: "Ana Souza", registrationNumber: "2026-001" },
              course: { name: "React do Zero" },
              class: { name: "Turma A" },
            },
            contentSummary: {
              completedContents: 6,
              inProgressContents: 2,
              notStartedContents: 2,
              totalContents: 10,
              progressPercentage: 60,
            },
            contents: [
              {
                title: "Introdução",
                type: "video",
                isRequired: true,
                progressStatus: "completed",
                progressPercentage: 100,
                lastAccessedAt: "2026-09-10",
              },
              {
                title: "Apostila 1",
                type: "pdf",
                isRequired: true,
                progressStatus: "in_progress",
                progressPercentage: 40,
                lastAccessedAt: "2026-09-12",
              },
            ],
            academicSummary: {
              total_items: 4,
              delivered_items: 3,
              pending_items: 1,
              overdue_items: 0,
              graded_items: 2,
              returned_items: 0,
              submitted_items: 1,
              average_grade: 8.5,
            },
            academicItems: [
              {
                title: "Trabalho 1",
                activity_kind: "activity",
                due_date: "2026-09-15",
                academic_status: "graded",
                score: 9,
                max_score: 10,
              },
              {
                title: "Prova 1",
                activity_kind: "exam",
                due_date: "2026-09-20",
                academic_status: "pending",
                score: null,
                max_score: 10,
              },
            ],
            attendance: {
              total: 8,
              present: 7,
              absent: 1,
              late: 0,
              excused: 0,
              attendanceRate: 87.5,
            },
          },
        }),
    },
    {
      id: "report_grades",
      group: "Relatórios",
      title: "Relatório de notas",
      render: () =>
        gradesReport.render({
          ...REPORT_META,
          grades: [
            {
              student: { name: "Ana Souza" },
              course: { name: "React do Zero" },
              class: { name: "Turma A" },
              activity: { title: "Prova 1" },
              teacher: { name: "Carlos Lima" },
              score: 9,
              maxScore: 10,
              gradedAt: "2026-09-12",
            },
          ],
        }),
    },
    {
      id: "report_attendance",
      group: "Relatórios",
      title: "Relatório de frequência",
      render: () =>
        attendanceReport.render({
          ...REPORT_META,
          attendanceRecords: [
            {
              student: { name: "Ana Souza" },
              course: { name: "React do Zero" },
              class: { name: "Turma A" },
              session: { title: "Encontro 1", date: "2026-09-08" },
              status: "present",
            },
            {
              student: { name: "Ana Souza" },
              course: { name: "React do Zero" },
              class: { name: "Turma A" },
              session: { title: "Encontro 2", date: "2026-09-10" },
              status: "absent",
            },
          ],
        }),
    },
    {
      id: "report_enrollments",
      group: "Relatórios",
      title: "Relatório de matrículas",
      render: () =>
        enrollmentsReport.render({
          ...REPORT_META,
          enrollments: [
            {
              student: { name: "Ana Souza", registrationNumber: "2026-001" },
              course: { name: "React do Zero" },
              class: { name: "Turma A" },
              status: "active",
              enrolledAt: "2026-09-01",
            },
          ],
        }),
    },
    {
      id: "report_academic_progress",
      group: "Relatórios",
      title: "Relatório de progresso acadêmico",
      render: () =>
        academicProgressReport.render({
          ...REPORT_META,
          progressRows: [
            {
              student: { name: "Ana Souza" },
              course: { name: "React do Zero" },
              class: { name: "Turma A" },
              completedContents: 6,
              totalContents: 10,
              progressPercentage: 60,
            },
          ],
        }),
    },
    {
      id: "report_invoices",
      group: "Relatórios",
      title: "Relatório financeiro de faturas",
      render: () =>
        invoicesReport.render({
          ...REPORT_META,
          invoices: [
            {
              id: 88,
              description: "Mensalidade setembro",
              planName: "Plano anual React",
              dueDate: "2026-09-10",
              status: "paid",
              amount: 200,
            },
            {
              id: 89,
              description: "Mensalidade outubro",
              planName: "Plano anual React",
              dueDate: "2026-10-10",
              status: "pending",
              amount: 200,
            },
          ],
        }),
    },
  ];
}

module.exports = { buildCatalog };

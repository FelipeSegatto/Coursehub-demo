/* ==========================================================
   COURSEHUB API
   Configuração inicial, middlewares globais e montagem de rotas.
   Toda a lógica de negócio vive em routes/ + services/.
   ========================================================== */

require("dotenv").config();

const { purgeExpiredAuthTokens } = require("./repositories/authTokens");

if (
  process.env.NODE_ENV === "production" &&
  process.env.PAYMENT_GATEWAY === "simulated"
) {
  throw new Error(
    "O gateway de pagamento simulado não pode ser utilizado em produção."
  );
}

// Falha rápido no boot, não no primeiro checkout: um gateway mal
// configurado nunca deve ser descoberto através de um pagamento
// falho de um aluno.
if (process.env.PAYMENT_GATEWAY === "mercado_pago") {
  const missingVars = ["MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_WEBHOOK_SECRET"].filter(
    (name) => !process.env[name]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `PAYMENT_GATEWAY=mercado_pago requer as variáveis de ambiente: ${missingVars.join(", ")}.`
    );
  }
}

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

require("./services/notifications/eventDefinitions");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const publicCourseRoutes = require("./routes/publicCourseRoutes");
const publicUserRoutes = require("./routes/publicUserRoutes");

const studentCourseRoutes = require("./routes/studentCourseRoutes");
const studentProgressRoutes = require("./routes/studentProgressRoutes");
const studentFinanceRoutes = require("./routes/studentFinanceRoutes");
const studentContentRoutes = require("./routes/studentContentRoutes");
const studentActivityRoutes = require("./routes/studentActivityRoutes");
const studentCalendarRoutes = require("./routes/studentCalendarRoutes");
const studentAttendanceRoutes = require("./routes/studentAttendanceRoutes");

const teacherCourseRoutes = require("./routes/teacherCourseRoutes");
const teacherClassRoutes = require("./routes/teacherClassRoutes");
const teacherSessionRoutes = require("./routes/teacherSessionRoutes");
const teacherAttendanceRoutes = require("./routes/teacherAttendanceRoutes");
const teacherContentRoutes = require("./routes/teacherContentRoutes");
const teacherActivityRoutes = require("./routes/teacherActivityRoutes");
const teacherCalendarRoutes = require("./routes/teacherCalendarRoutes");
const teacherAttendanceHistoryRoutes = require("./routes/teacherAttendanceHistoryRoutes");
const teacherStudentProgressRoutes = require("./routes/teacherStudentProgressRoutes");
const teacherGradeRoutes = require("./routes/teacherGradeRoutes");
const teacherDashboardRoutes = require("./routes/teacherDashboardRoutes");

const adminStudentRoutes = require("./routes/adminStudentRoutes");
const adminTeacherRoutes = require("./routes/adminTeacherRoutes");
const adminCourseRoutes = require("./routes/adminCourseRoutes");
const adminCoursePricingPlanRoutes = require("./routes/adminCoursePricingPlanRoutes");
const adminClassRoutes = require("./routes/adminClassRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const adminEnrollmentRoutes = require("./routes/adminEnrollmentRoutes");
const adminContentRoutes = require("./routes/adminContentRoutes");
const adminActivityRoutes = require("./routes/adminActivityRoutes");
const adminGradeRoutes = require("./routes/adminGradeRoutes");
const adminAttendanceRoutes = require("./routes/adminAttendanceRoutes");
const adminFinancialRoutes = require("./routes/adminFinancialRoutes");
const adminContractingPartyRoutes = require("./routes/adminContractingPartyRoutes");
const adminCalendarRoutes = require("./routes/adminCalendarRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const adminAcademicDocumentsRoutes = require("./routes/adminAcademicDocumentsRoutes");
const studentAcademicDocumentsRoutes = require("./routes/studentAcademicDocumentsRoutes");
const teacherAcademicDocumentsRoutes = require("./routes/teacherAcademicDocumentsRoutes");
const publicDocumentVerificationRoutes = require("./routes/publicDocumentVerificationRoutes");
const adminAcademicProgressRoutes = require("./routes/adminAcademicProgressRoutes");
const adminReportsRoutes = require("./routes/adminReportsRoutes");
const adminStudentProgressRoutes = require("./routes/adminStudentProgressRoutes");
const adminClassSessionRoutes = require("./routes/adminClassSessionRoutes");

const notificationRoutes = require("./routes/notificationRoutes");
const notificationPreferenceRoutes = require("./routes/notificationPreferenceRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminChatRoutes = require("./routes/adminChatRoutes");
const adminPermissionRoutes = require("./routes/adminPermissionRoutes");
const adminSystemHealthRoutes = require("./routes/adminSystemHealthRoutes");
const paymentWebhookRoutes = require("./routes/paymentWebhookRoutes");
const publicInvoicePaymentRoutes = require("./routes/publicInvoicePaymentRoutes");
const publicCheckoutRoutes = require("./routes/publicCheckoutRoutes");
const publicInstitutionRoutes = require("./routes/publicInstitutionRoutes");
const publicContactRoutes = require("./routes/publicContactRoutes");
const adminContactRoutes = require("./routes/adminContactRoutes");
const fileRoutes = require("./routes/fileRoutes");

const app = express();
const PORT = process.env.PORT || 3001;

/* ==========================================================
   MIDDLEWARES GLOBAIS
   ========================================================== */

// O CourseHub é uma API só de JSON, sem HTML renderizado pelo
// servidor, então a maior parte dos padrões do helmet (CSP, COEP)
// protege um contexto de renderização que não existe aqui e é
// desligada em vez de deixada no padrão genérico.
// crossOriginResourcePolicy é definido explicitamente como
// "cross-origin": o frontend (CORS_ORIGIN, uma origem diferente em
// dev) busca essas respostas JSON com credenciais, e o padrão
// "same-origin" do helmet faria o *navegador* bloquear essa
// requisição independentemente dos headers de CORS abaixo -- CORP e
// CORS são mecanismos separados. O que é mantido (frameguard,
// nosniff, HSTS quando de fato servido via HTTPS) é defesa em
// profundidade de verdade, sem nenhuma desvantagem para o formato
// desta aplicação.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

/* ==========================================================
   ROTAS
   ========================================================== */

app.use("/api", authRoutes);
app.use("/api", profileRoutes);
app.use("/api", fileRoutes);
app.use("/api", publicCourseRoutes);
app.use("/api", publicUserRoutes);

app.use("/api", notificationRoutes);
app.use("/api", notificationPreferenceRoutes);
app.use("/api", chatRoutes);
app.use("/api", adminChatRoutes);
app.use("/api", adminPermissionRoutes);
app.use("/api", adminSystemHealthRoutes);
app.use("/api", paymentWebhookRoutes);
app.use("/api/public/invoice-payment", publicInvoicePaymentRoutes);
app.use("/api/public/checkout", publicCheckoutRoutes);
app.use("/api/public", publicInstitutionRoutes);
app.use("/api/public", publicContactRoutes);

app.use("/api", studentCourseRoutes);
app.use("/api", studentProgressRoutes);
app.use("/api", studentFinanceRoutes);
app.use("/api", studentContentRoutes);
app.use("/api", studentActivityRoutes);
app.use("/api", studentCalendarRoutes);
app.use("/api", studentAttendanceRoutes);

app.use("/api", teacherCourseRoutes);
app.use("/api", teacherClassRoutes);
app.use("/api", teacherSessionRoutes);
app.use("/api", teacherAttendanceRoutes);
app.use("/api", teacherContentRoutes);
app.use("/api", teacherActivityRoutes);
app.use("/api", teacherCalendarRoutes);
app.use("/api", teacherAttendanceHistoryRoutes);
app.use("/api", teacherStudentProgressRoutes);
app.use("/api", teacherGradeRoutes);
app.use("/api", teacherDashboardRoutes);

app.use("/api", adminStudentRoutes);
app.use("/api", adminTeacherRoutes);
app.use("/api", adminCourseRoutes);
app.use("/api", adminCoursePricingPlanRoutes);
app.use("/api", adminClassRoutes);
app.use("/api", adminUserRoutes);
app.use("/api", adminEnrollmentRoutes);
app.use("/api", adminContentRoutes);
app.use("/api", adminActivityRoutes);
app.use("/api", adminGradeRoutes);
app.use("/api", adminAttendanceRoutes);
app.use("/api/admin/financial", adminFinancialRoutes);
app.use("/api", adminContractingPartyRoutes);
app.use("/api", adminContactRoutes);
app.use("/api/admin/calendar", adminCalendarRoutes);
app.use("/api", adminDashboardRoutes);
app.use("/api/admin/academic-documents", adminAcademicDocumentsRoutes);
app.use("/api/student/academic-documents", studentAcademicDocumentsRoutes);
app.use("/api/teacher/academic-documents", teacherAcademicDocumentsRoutes);
app.use("/api/public/documents", publicDocumentVerificationRoutes);
app.use("/api", adminAcademicProgressRoutes);
app.use("/api/admin/reports", adminReportsRoutes);
app.use("/api", adminStudentProgressRoutes);
app.use("/api", adminClassSessionRoutes);

/* ==========================================================
   INICIALIZAÇÃO DA API
   ========================================================== */

app.listen(PORT, () => {
  console.log(`Servidor CourseHub rodando em http://localhost:${PORT}`);

  purgeExpiredAuthTokens().catch((error) => {
    console.error("Falha ao purgar tokens expirados no boot:", error.message);
  });
});
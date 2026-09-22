import { createBrowserRouter } from "react-router-dom";

import PublicLayout from "../layouts/PublicLayout";
import AdminLayout from "../layouts/AdminLayout";
import MainLayout from "../layouts/MainLayout";
import TeacherLayout from "../layouts/TeacherLayout";
import AuthLayout from "../layouts/AuthLayout";

import LoginPage from "../pages/auth/LoginPage";
import SignUpPage from "../pages/auth/SignUpPage";
import ProfileSecurity from "../pages/profile/ProfileSecurity";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import ActivateAccount from "../pages/auth/ActivateAccount";

import HomePage from "../pages/public/HomePage";
import DashboardPage from "../pages/public/DashboardPage";
import AboutPage from "../pages/public/AboutPage";
import CoursesPage from "../pages/public/CoursesPage";
import CoursePage from "../pages/public/CoursePage";
import InvoicePaymentLink from "../pages/public/InvoicePaymentLink";
import TermsOfUse from "../pages/public/TermsOfUse";
import PrivacyPolicy from "../pages/public/PrivacyPolicy";
import VerifyCheckoutEmail from "../pages/public/checkout/VerifyCheckoutEmail";
import PublicCheckoutWizard from "../pages/public/checkout/PublicCheckoutWizard";
import CheckoutProcessing from "../pages/public/checkout/CheckoutProcessing";
import CheckoutResult from "../pages/public/checkout/CheckoutResult";
import VerifyDocument from "../pages/public/VerifyDocument";
import ContactPage from "../pages/public/ContactPage";

import StudentHome from "../pages/student/StudentHome";
import StudentDashboard from "../pages/student/StudentDashboard";
import CoursePlayer from "../pages/student/CoursePlayer";
import StudentCourses from "../pages/student/StudentCourses";
import StudentActivities from "../pages/student/StudentActivities";
import StudentNotifications from "../pages/student/StudentNotifications";
import StudentAssessments from "../pages/student/StudentAssessments";
import StudentGrades from "../pages/student/StudentGrades";
import StudentProgress from "../pages/student/StudentProgress";
import StudentFinance from "../pages/student/StudentFinance";
import StudentDocuments from "../pages/student/StudentDocuments";
import StudentCoursePurchase from "../pages/student/StudentCoursePurchase";
import StudentActivityRunner from "../pages/student/StudentActivityRunner";
import StudentCalendar from "../pages/student/StudentCalendar";
import StudentChat from "../pages/student/StudentChat";
import StudentAttendance from "../pages/student/StudentAttendance";

import HomeAdmin from "../pages/admin/HomeAdmin";
import DashboardAdmin from "../pages/admin/DashboardAdmin";
import CourseAdmin from "../pages/admin/CourseAdmin";
import StudentsAdmin from "../pages/admin/StudentsAdmin";
import TeachersAdmin from "../pages/admin/TeachersAdmin";
import ClassesAdmin from "../pages/admin/ClassesAdmin";
import UsersAdmin from "../pages/admin/UsersAdmin";
import EnrollmentsAdmin from "../pages/admin/EnrollmentsAdmin";
import MaterialsAdmin from "../pages/admin/MaterialsAdmin";
import ActivitiesAdmin from "../pages/admin/ActivitiesAdmin";
import AssessmentsAdmin from "../pages/admin/AssessmentsAdmin";
import CertificatesAdmin from "../pages/admin/CertificatesAdmin";
import FinancialContractsAdmin from "../pages/admin/financial/FinancialContractsAdmin";
import ContractingPartiesAdmin from "../pages/admin/financial/ContractingPartiesAdmin";
import AdminContacts from "../pages/admin/AdminContacts";
import FinancialContractsDetails from "../pages/admin/financial/FinancialContractsDetails";
import FinancialInvoicesAdmin from "../pages/admin/financial/FinancialInvoicesAdmin";
import FinancialInvoicesDetails from "../pages/admin/financial/FinancialInvoicesDetails";
import FinancialDashboard from "../pages/admin/financial/FinancialDashboard";
import PricingPlansAdmin from "../pages/admin/PricingPlansAdmin";
import CalendarAdmin from "../pages/admin/CalendarAdmin";
import GradesAdmin from "../pages/admin/GradesAdmin";
import AttendanceAdmin from "../pages/admin/AttendanceAdmin";
import AdminAttendanceSessionDetailPage from "../pages/admin/AdminAttendanceSessionDetailPage";
import AdminSessionsPage from "../pages/admin/AdminSessionsPage";
import AdminStudentProgressPage from "../pages/admin/AdminStudentProgressPage";
import AdminStudentProgressDetailPage from "../pages/admin/AdminStudentProgressDetailPage";
import NotificationsAdmin from "../pages/admin/NotificationsAdmin";
import ChatAdmin from "../pages/admin/ChatAdmin";
import ModerationAdmin from "../pages/admin/ModerationAdmin";
import SystemHealthAdmin from "../pages/admin/SystemHealthAdmin";

import TeacherHome from "../pages/teacher/TeacherHome";
import TeacherDashboard from "../pages/teacher/TeacherDashboard";
import TeacherClasses from "../pages/teacher/TeacherClasses";
import TeacherSessionsPage from "../pages/teacher/TeacherSessionsPage";
import TeacherClassDetails from "../pages/teacher/TeacherClassDetails";
import TeacherMaterials from "../pages/teacher/TeacherMaterials";
import MaterialPlayer from "../pages/teacher/MaterialPlayer";
import TeacherActivities from "../pages/teacher/TeacherActivities";
import TeacherAssessments from "../pages/teacher/TeacherAssessments";
import TeacherActivitySubmissions from "../pages/teacher/TeacherActivitySubmissions";
import TeacherSubmissionReview from "../pages/teacher/TeacherSubmissionReview";
import TeacherAttendance from "../pages/teacher/TeacherAttendance";
import TeacherAttendanceHistory from "../pages/teacher/TeacherAttendanceHistory";
import TeacherGrades from "../pages/teacher/TeacherGrades";
import TeacherStudentProgressPage from "../pages/teacher/TeacherStudentProgressPage";
import TeacherStudentProgressDetailPage from "../pages/teacher/TeacherStudentProgressDetailPage";
import TeacherEligibility from "../pages/teacher/TeacherEligibility";
import TeacherCalendar from "../pages/teacher/TeacherCalendar";
import TeacherNotifications from "../pages/teacher/TeacherNotifications";
import TeacherChat from "../pages/teacher/TeacherChat";



import ProtectedRoute from "../auth/ProtectedRoute";
import PublicOnlyRoute from "../auth/PublicOnlyRoute";
import RoleRoute from "./RoleRoute";
import UserProfile from "../pages/profile/UserProfile";

function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-5xl font-bold">
        404
      </h1>

      <p className="mt-4 text-gray-600">
        Página não encontrada.
      </p>
    </main>
  );
}

export const router = createBrowserRouter([
  // =========================================================
  // ROTAS PÚBLICAS
  // =========================================================

  {
    path: "/",
    element: <PublicLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },

      // ============================
      // CURSOS
      // ============================

      {
        path: "courses",
        element: <CoursesPage />,
      },
      {
        path: "courses/:id",
        element: <CoursePage />,
      },

      // ============================
      // INSTITUCIONAL
      // ============================

      {
        path: "about",
        element: <AboutPage />,
      },

       // ============================
      // PRÉVIA PÚBLICA DO DASHBOARD DO ALUNO
      // ============================
      {
        path:"portal",
        element: <DashboardPage />,
      },

      // ============================
      // PAGAMENTO PRIVADO DE FATURA
      // Link seguro por token -- sem login, uma única invoice.
      // ============================
      {
        path: "pagamento/fatura",
        element: <InvoicePaymentLink />,
      },
      {
        path: "fale-conosco",
        element: <ContactPage />,
      },

      // ============================
      // TERMOS E PRIVACIDADE
      // ============================
      {
        path: "termos-de-uso",
        element: <TermsOfUse />,
      },
      {
        path: "politica-de-privacidade",
        element: <PrivacyPolicy />,
      },

      // ============================
      // CHECKOUT PÚBLICO
      // ============================
      {
        path: "checkout/verificar-email",
        element: <VerifyCheckoutEmail />,
      },
      {
        path: "checkout/curso/:courseId",
        element: <PublicCheckoutWizard />,
      },
      {
        path: "checkout/processando",
        element: <CheckoutProcessing />,
      },
      {
        path: "checkout/resultado",
        element: <CheckoutResult />,
      },

      // ============================
      // VERIFICAÇÃO PÚBLICA DE DOCUMENTOS
      // ============================
      {
        path: "documentos/verificar",
        element: <VerifyDocument />,
      },
      {
        path: "documentos/verificar/:code",
        element: <VerifyDocument />,
      },
    ],
  },

  // =========================================================
  // LOGIN, CADASTRO E RECUPERAÇÃO DE SENHA
  // Login/cadastro redirecionam usuários já autenticados;
  // recuperação de senha fica acessível independente da sessão.
  // =========================================================

  {
    element: <AuthLayout />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            path: "/login",
            element: <LoginPage />,
          },
          {
            path: "/register",
            element: <SignUpPage />,
          },
        ],
      },
      {
        path: "/esqueci-minha-senha",
        element: <ForgotPassword />,
      },
      {
        path: "/redefinir-senha",
        element: <ResetPassword />,
      },
      {
        path: "/ativar-conta",
        element: <ActivateAccount />,
      },
    ],
  },

  // =========================================================
  // ÁREA DO ALUNO
  // =========================================================

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: (
          <RoleRoute
            allowedRoles={["student"]}
          />
        ),

        children: [
          {
            path: "/aluno",
            element: <MainLayout />,

            children: [
              {
                index: true,
                element: <StudentHome />,
              },
              {
                path: "dashboard-aluno",
                element: <StudentDashboard />,
              },
              {
                path: "dashboard-aluno/courses/:id",
                element: <CoursePlayer />,
              },
              {
                path: "meus-cursos",
                element: <StudentCourses />,
              },
              {
                path: "financeiro",
                element: <StudentFinance />,
              },
              {
                path: "financeiro/comprar/:courseId",
                element: <StudentCoursePurchase />,
              },
              {
                path: "documentos",
                element: <StudentDocuments />,
              },
              {
                path: "notificacoes",
                element: <StudentNotifications />,
              },
              {
                path: "chat",
                element: <StudentChat />,
              },

              // ============================
              // ATIVIDADES
              // ============================

              {
                path: "atividades",
                element: <StudentActivities />,
              },
              {
                path: "atividades/:activityId",
                element: (
                  <StudentActivityRunner />
                ),
              },

              // ============================
              // AVALIAÇÕES
              // ============================

              {
                path: "avaliacoes",
                element: <StudentAssessments />,
              },
              {
                path: "avaliacoes/:activityId",
                element: (
                  <StudentActivityRunner />
                ),
              },
              {
                path: "notas",
                element: <StudentGrades />,
              },
              {
                path: "progresso",
                element: <StudentProgress />,
              },
              {
                path: "calendario",
                element: <StudentCalendar />,
              },
              {
                path: "frequencia",
                element: <StudentAttendance />,
              },
              {
                path: "perfil",
                element: <UserProfile />,
              },
                {
                  path: "perfil/seguranca",
                  element: <ProfileSecurity />,
                },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================
  // ÁREA ADMINISTRATIVA
  // =========================================================

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: (
          <RoleRoute
            allowedRoles={["admin"]}
          />
        ),

        children: [
          {
            path: "/admin",
            element: <AdminLayout />,

            children: [
              {
                index: true,
                element: <HomeAdmin />,
              },
              {
                path: "dashboard-admin",
                element: <DashboardAdmin />,
              },
              {
                path: "cursos",
                element: <CourseAdmin />,
              },
              {
                path: "alunos",
                element: <StudentsAdmin />,
              },
              {
                path: "professores",
                element: <TeachersAdmin />,
              },
              {
                path: "turmas",
                element: <ClassesAdmin />,
              },
              {
                path: "usuarios",
                element: <UsersAdmin />,
              },
              {
                path: "matriculas",
                element: <EnrollmentsAdmin />,
              },
              {
                path: "contatos",
                element: <AdminContacts />,
              },
              {
                path: "materiais",
                element: <MaterialsAdmin />,
              },
              {
                path: "atividades",
                element: <ActivitiesAdmin />,
              },
              {
                path: "avaliacoes",
                element: <AssessmentsAdmin />,
              },
              {
                path: "notas",
                element: <GradesAdmin />,
              },
              {
                path: "frequencia",
                element: <AttendanceAdmin />,
              },
              {
                path: "frequencia/encontros/:sessionId",
                element: <AdminAttendanceSessionDetailPage />,
              },
              {
                path: "encontros",
                element: <AdminSessionsPage />,
              },
              {
                path: "progressao",
                element: <AdminStudentProgressPage />,
              },
              {
                path: "progressao/matriculas/:enrollmentId",
                element: <AdminStudentProgressDetailPage />,
              },
              {
                path: "financeiro",
                element: <FinancialDashboard />,
              },
              {
                path: "financeiro/contratos",
                element: <FinancialContractsAdmin />,
              },
              {
                path: "financeiro/contratos/:contratoId",
                element: <FinancialContractsDetails />,
              },
              {
                path: "financeiro/cobrancas",
                element: <FinancialInvoicesAdmin />,
              },
              {
                path: "financeiro/cobrancas/:cobrancaId",
                element: <FinancialInvoicesDetails />,
              },
              {
                path: "financeiro/planos",
                element: <PricingPlansAdmin />,
              },
              {
                path: "financeiro/contratantes",
                element: <ContractingPartiesAdmin />,
              },
              {
                path: "emissao",
                element: <CertificatesAdmin />,
              },
              {
                path: "calendario",
                element: <CalendarAdmin />,
              },
              {
                path: "notificacoes",
                element: <NotificationsAdmin />,
              },
              {
                path: "chat",
                element: <ChatAdmin />,
              },
              {
                path: "moderacao",
                element: <ModerationAdmin />,
              },
              {
                path: "sistema",
                element: <SystemHealthAdmin />,
              },
              {
                path: "perfil",
                element: <UserProfile />,
              },
              {
                path: "perfil/seguranca",
                element: <ProfileSecurity />,
              },
            ],
          },
        ],
      },
    ],
  },

  // =========================================================
  // ÁREA DO PROFESSOR
  // =========================================================

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: (
          <RoleRoute
            allowedRoles={["teacher"]}
          />
        ),

        children: [
          {
            path: "/professor",
            element: <TeacherLayout />,

            children: [
              {
                index: true,
                element: <TeacherHome />,
              },
              {
                path: "dashboard-professor",
                element: (
                  <TeacherDashboard />
                ),
              },

              // ============================
              // TURMAS
              // ============================

              {
                path: "minhas-turmas",
                element: (
                  <TeacherClasses />
                ),
              },
              {
                path: "encontros",
                element: (
                  <TeacherSessionsPage />
                ),
              },
              {
                path: "turmas/:classId",
                element: (
                  <TeacherClassDetails />
                ),
              },
              {
                path: "turmas/:classId/frequencia",
                element: (
                  <TeacherAttendance />
                ),
              },
              {
                path: "frequencia",
                element: (
                  <TeacherAttendanceHistory />
                ),
              },

              // ============================
              // ATIVIDADES
              // ============================

              {
                path: "atividades",
                element: <TeacherActivities />,
              },
              {
                path: "atividades/:activityId/envios",
                element: (
                  <TeacherActivitySubmissions />
                ),
              },

              // ============================
              // AVALIAÇÕES
              // ============================

              {
                path: "avaliacoes",
                element: <TeacherAssessments />,
              },
              {
                path: "avaliacoes/:activityId/envios",
                element: (
                  <TeacherActivitySubmissions />
                ),
              },

              // ============================
              // CORREÇÃO DE SUBMISSÃO
              // ============================

              {
                path: "envios/:submissionId/corrigir",
                element: (
                  <TeacherSubmissionReview />
                ),
              },

              // ============================
              // MATERIAIS
              // ============================

              {
                path: "materiais",
                element: <TeacherMaterials />,
              },
              {
                path: "turmas/:classId/materiais",
                element: <MaterialPlayer />,
              },

              // ============================
              // OUTRAS PÁGINAS
              // ============================

              {
                path: "notas",
                element: <TeacherGrades />,
              },
              {
                path: "progressao",
                element: <TeacherStudentProgressPage />,
              },
              {
                path: "progressao/matriculas/:enrollmentId",
                element: <TeacherStudentProgressDetailPage />,
              },
              {
                path: "elegibilidade",
                element: <TeacherEligibility />,
              },
              {
                path: "calendario",
                element: <TeacherCalendar />,
              },
              {
                path: "notificacoes",
                element: <TeacherNotifications />,
              },
              {
                path: "chat",
                element: <TeacherChat />,
              },
              {
                path: "perfil",
                element: <UserProfile />,
              },
               {
                path: "perfil/seguranca",
                element: <ProfileSecurity />,
              },
            ],
          },
        ],
      },
    ],
  },



  // =========================================================
  // ROTA GLOBAL 404
  // =========================================================

  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
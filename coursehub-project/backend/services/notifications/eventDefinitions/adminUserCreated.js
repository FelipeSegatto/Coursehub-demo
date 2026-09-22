const { registerNotificationType } = require("../notificationTypeRegistry");

const ROLE_LABEL = {
  student: "aluno",
  teacher: "professor",
  admin: "administrador",
};

const LISTING_PATH_BY_ROLE = {
  student: "/admin/alunos",
  teacher: "/admin/professores",
  admin: "/admin/usuarios",
};

/**
 * Fired at the actual account-creation points (adminStudentService.
 * createStudent, publicUserService.registerStudent,
 * adminTeacherService.createTeacher, adminUserService.createAdminUser/
 * createUser) -- NEVER at the checkout-stub creation
 * (publicCheckoutIdentityService.resolveOrCreateCheckoutStudent calls
 * createStudent with allowNullPassword:true, which is explicitly
 * excluded, since that's a temporary pending_activation placeholder,
 * not a real registration event yet). No individual admin/user detail
 * route exists today, so the deep link always falls back to the
 * role's listing page.
 *
 * excludeActor (createNotificationEvent's default) is what implements
 * "don't notify the admin who manually created this user themselves"
 * -- the creating admin is passed as actorUserId and is filtered out
 * of resolveAllActiveAdmins()'s result if they're in it; self-
 * registration/public flows pass the new user's own id (never an
 * admin), so nothing gets excluded there.
 */
registerNotificationType({
  type: "admin.user.created",
  category: "registration",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["userId", "userName", "userRole"],

  buildTitle: () => "Novo usuário cadastrado",

  buildMessage: (context) => {
    const roleLabel = ROLE_LABEL[context.userRole] || context.userRole;
    const originSuffix = context.origin ? ` (${context.origin})` : "";

    return `${context.userName} foi cadastrado(a) como ${roleLabel}${originSuffix}.`;
  },

  buildActionPath: (context) => LISTING_PATH_BY_ROLE[context.userRole] || "/admin/usuarios",

  buildDeduplicationKey: (context) => `admin:user-created:${context.userId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});

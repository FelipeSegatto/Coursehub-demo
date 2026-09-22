import {
  apiFetch,
} from "./APIService";


function buildQueryString(
  params = {}
) {

  const query =
    new URLSearchParams();


  Object.entries(
    params
  ).forEach(
    ([
      key,
      value,
    ]) => {

      const shouldIgnore =
        value ===
          undefined ||
        value ===
          null ||
        value === "";


      if (!shouldIgnore) {

        query.append(
          key,
          String(
            value
          )
        );
      }
    }
  );


  return query.toString();
}


/**
 * ============================================================
 * CONVERSAS
 * ============================================================
 */
export async function listConversations(
  params = {}
) {

  const queryString =
    buildQueryString(
      params
    );


  return apiFetch(
    queryString
      ? `/api/chat/conversations?${queryString}`
      : "/api/chat/conversations"
  );
}


export async function getUnreadChatCount() {

  return apiFetch(
    "/api/chat/unread-count"
  );
}


export async function getConversation(
  conversationId
) {

  return apiFetch(
    `/api/chat/conversations/${conversationId}`
  );
}


/**
 * ============================================================
 * MENSAGENS
 * ============================================================
 */
export async function listMessages(
  conversationId,
  params = {}
) {

  const queryString =
    buildQueryString(
      params
    );


  const base =
    `/api/chat/conversations/${conversationId}/messages`;


  return apiFetch(
    queryString
      ? `${base}?${queryString}`
      : base
  );
}


export async function sendMessage(
  conversationId,
  {
    body,
    clientMessageId,
    replyToMessageId,
  }
) {

  return apiFetch(
    `/api/chat/conversations/${conversationId}/messages`,
    {
      method:
        "POST",

      body:
        JSON.stringify({
          body,
          clientMessageId,
          replyToMessageId,
        }),
    }
  );
}


export async function markConversationRead(
  conversationId,
  {
    lastReadMessageId,
  } = {}
) {

  return apiFetch(
    `/api/chat/conversations/${conversationId}/read`,
    {
      method:
        "PATCH",

      body:
        JSON.stringify({
          lastReadMessageId,
        }),
    }
  );
}


export async function archiveConversation(
  conversationId
) {

  return apiFetch(
    `/api/chat/conversations/${conversationId}/archive`,
    {
      method:
        "PATCH",
    }
  );
}


/**
 * ============================================================
 * CHAT ACADÊMICO ENTRE ALUNOS
 * ============================================================
 */
export async function listAcademicContacts(search, classId) {
  const queryString = buildQueryString({
    search,
    classId,
  });

  return apiFetch(
    queryString ? `/api/chat/academic-contacts?${queryString}` : "/api/chat/academic-contacts"
  );
}


export async function openAcademicPeerConversation(
  peerUserId
) {

  return apiFetch(
    "/api/chat/academic-conversations",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          peerUserId,
        }),
    }
  );
}


/**
 * ============================================================
 * PROFESSORES DISPONÍVEIS PARA CHAT
 * ============================================================
 *
 * Lista somente professores:
 *
 * - ativos;
 * - vinculados ao curso;
 * - cujo curso pertence a uma matrícula
 *   ativa do aluno autenticado.
 *
 * A autorização real acontece no backend.
 */
export async function listTeacherContacts(
  courseId
) {

  const queryString =
    buildQueryString({
      courseId,
    });


  return apiFetch(
    `/api/chat/teacher-contacts?${queryString}`
  );
}


/**
 * ============================================================
 * ABRIR DÚVIDA COM PROFESSOR
 * ============================================================
 *
 * Agora enviamos teacherId.
 *
 * O backend NÃO confia cegamente nele:
 * valida que o professor realmente pertence
 * ao curso.
 */
export async function openTeacherQuestion({
  courseId,
  classId,
  teacherId,
  topic,
  subject,
  body,
}) {

  return apiFetch(
    "/api/chat/teacher-questions",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          courseId,
          classId,
          teacherId,
          topic,
          subject,
          body,
        }),
    }
  );
}


/**
 * ============================================================
 * RESOLVER
 * ============================================================
 */
export async function resolveConversation(
  conversationId
) {

  return apiFetch(
    `/api/chat/conversations/${conversationId}/resolve`,
    {
      method:
        "PATCH",
    }
  );
}


/**
 * ============================================================
 * ADMINISTRATIVO
 * ============================================================
 */
export async function openAdministrativeTicket({
  category,
  subject,
  body,
}) {

  return apiFetch(
    "/api/chat/administrative-tickets",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          category,
          subject,
          body,
        }),
    }
  );
}


export async function listAdministrativeQueue(
  params = {}
) {

  const queryString =
    buildQueryString(
      params
    );


  return apiFetch(
    queryString
      ? `/api/admin/chat/administrative-tickets?${queryString}`
      : "/api/admin/chat/administrative-tickets"
  );
}


export async function assignChatTicket(
  conversationId
) {

  return apiFetch(
    `/api/admin/chat/conversations/${conversationId}/assign`,
    {
      method:
        "PATCH",
    }
  );
}


/**
 * ============================================================
 * PROFESSOR -> ADMINISTRAÇÃO
 * ============================================================
 */
export async function openStaffTicket({
  category,
  subject,
  body,
}) {

  return apiFetch(
    "/api/chat/staff-tickets",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          category,
          subject,
          body,
        }),
    }
  );
}


export async function listStaffQueue(
  params = {}
) {

  const queryString =
    buildQueryString(
      params
    );


  return apiFetch(
    queryString
      ? `/api/admin/chat/staff-tickets?${queryString}`
      : "/api/admin/chat/staff-tickets"
  );
}


export async function openStaffConversation({
  teacherUserId,
  category,
  subject,
  body,
}) {

  return apiFetch(
    "/api/admin/chat/staff-conversations",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          teacherUserId,
          category,
          subject,
          body,
        }),
    }
  );
}


export async function listActiveTeachersForChat() {

  const teachers =
    await apiFetch(
      "/api/admin/teachers"
    );


  return (
    teachers || []
  ).filter(
    (teacher) =>
      teacher.status ===
        "active" &&
      teacher.user_status ===
        "active"
  );
}


/**
 * ============================================================
 * MODERAÇÃO
 * ============================================================
 */
export async function reportMessage(
  messageId,
  {
    reason,
    details,
  }
) {

  return apiFetch(
    `/api/chat/messages/${messageId}/report`,
    {
      method:
        "POST",

      body:
        JSON.stringify({
          reason,
          details,
        }),
    }
  );
}


export async function listReports(
  params = {}
) {

  const queryString =
    buildQueryString(
      params
    );


  return apiFetch(
    queryString
      ? `/api/admin/chat/reports?${queryString}`
      : "/api/admin/chat/reports"
  );
}


export async function reviewReport(
  reportId,
  {
    status,
    resolutionNote,
  }
) {

  return apiFetch(
    `/api/admin/chat/reports/${reportId}`,
    {
      method:
        "PATCH",

      body:
        JSON.stringify({
          status,
          resolutionNote,
        }),
    }
  );
}
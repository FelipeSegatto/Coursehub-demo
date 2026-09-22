// Single source of truth for "where does this role land" -- reused by
// every place that needs to send a user to their own area (post-login
// redirect, PublicOnlyRoute bouncing an already-logged-in user away
// from /login, and RoleRoute sending a user back home when they try to
// open a route that belongs to a different role). Anything that isn't
// a recognized role falls back to the student area, matching the
// behavior these call sites already had before being consolidated.
const ROLE_HOME_PATHS = {
  admin: "/admin",
  teacher: "/professor",
  student: "/aluno",
};

export function getRoleHomePath(role) {
  return ROLE_HOME_PATHS[role] || "/aluno";
}

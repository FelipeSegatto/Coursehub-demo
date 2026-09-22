/**
 * Resumo de frequência de UM aluno em UMA turma -- extraído de
 * adminStudentProgressService.js para uso compartilhado (admin,
 * professor e o próprio aluno) sem criar dependência circular entre
 * os módulos de progresso.
 *
 * Frequência só existe quando há turma definida -- sem isso não há
 * como escopar quais sessões pertencem a esta matrícula.
 */
async function loadAttendanceSummary(db, { studentId, classId }) {
  if (!classId) return null;

  const [rows] = await db.promise().query(
    `
      SELECT att.status
      FROM attendance att
      INNER JOIN class_sessions cs ON cs.id = att.class_session_id
      WHERE cs.class_id = ? AND att.student_id = ?
    `,
    [classId, studentId]
  );

  const total = rows.length;
  const present = rows.filter((row) => row.status === "present").length;
  const absent = rows.filter((row) => row.status === "absent").length;
  const late = rows.filter((row) => row.status === "late").length;
  const excused = rows.filter((row) => row.status === "excused").length;

  return {
    total,
    present,
    absent,
    late,
    excused,
    attendanceRate: total > 0 ? Number(((present / total) * 100).toFixed(2)) : null,
  };
}

module.exports = {
  loadAttendanceSummary,
};

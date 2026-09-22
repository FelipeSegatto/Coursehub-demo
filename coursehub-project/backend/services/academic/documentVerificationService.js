/**
 * Verificação pública por código -- usada pela rota sem autenticação
 * /api/public/documents/verify/:code. Retorna só o mínimo necessário
 * para confirmar autenticidade (pensado para alguém como um
 * empregador conferir um certificado/declaração de um candidato):
 * nunca CPF, e-mail, IDs internos, notas ou frequência detalhada.
 * Busca em declarations OU certificates -- os dois compartilham o
 * mesmo espaço de código opaco (nunca colidem entre si na prática,
 * cada um com sua própria UNIQUE KEY, mas nunca ambíguo para quem
 * verifica: um código só existe em uma das duas tabelas).
 */
async function verifyByCode(db, code) {
  const normalizedCode = String(code || "")
    .trim()
    .toUpperCase();

  if (!normalizedCode) {
    return { status: "not_found" };
  }

  const [declarationRows] = await db.promise().query(
    `
      SELECT d.status, d.declaration_type, d.created_at,
             s.name AS student_name, co.name AS course_name
      FROM declarations d
      INNER JOIN enrollments e ON e.id = d.enrollment_id
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN courses co ON co.id = e.course_id
      WHERE d.verification_code = ?
      LIMIT 1
    `,
    [normalizedCode]
  );

  if (declarationRows.length > 0) {
    const row = declarationRows[0];

    return {
      status: row.status === "active" ? "valid" : "revoked",
      documentType: `${row.declaration_type}_declaration`,
      studentName: row.student_name,
      courseName: row.course_name,
      issuedAt: row.created_at,
      verificationCode: normalizedCode,
    };
  }

  const [certificateRows] = await db.promise().query(
    `
      SELECT c.status, c.created_at,
             s.name AS student_name, co.name AS course_name, co.workload_hours
      FROM certificates c
      INNER JOIN enrollments e ON e.id = c.enrollment_id
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN courses co ON co.id = e.course_id
      WHERE c.verification_code = ?
      LIMIT 1
    `,
    [normalizedCode]
  );

  if (certificateRows.length > 0) {
    const row = certificateRows[0];

    return {
      status: row.status === "active" ? "valid" : "revoked",
      documentType: "certificate",
      studentName: row.student_name,
      courseName: row.course_name,
      workloadHours: row.workload_hours !== null ? Number(row.workload_hours) : null,
      issuedAt: row.created_at,
      verificationCode: normalizedCode,
    };
  }

  return { status: "not_found" };
}

module.exports = { verifyByCode };

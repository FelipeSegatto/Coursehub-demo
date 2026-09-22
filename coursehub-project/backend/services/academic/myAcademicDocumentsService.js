/**
 * Lista consolidada dos documentos acadêmicos (declarações +
 * certificados) do aluno autenticado, para a tela "Meus Documentos".
 * Só leitura -- nenhuma ação de emissão aqui (Fase 2 é sempre
 * emissão por admin).
 */
async function listMyAcademicDocuments(db, { studentId }) {
  const [rows] = await db.promise().query(
    `
      SELECT
        'declaration' AS kind, d.id, d.declaration_type AS type, d.enrollment_id,
        d.verification_code, d.status, d.created_at, gd.status AS document_status,
        co.name AS course_name,
        DATE_FORMAT(d.reference_period_start, '%Y-%m-%d') AS reference_period_start,
        DATE_FORMAT(d.reference_period_end, '%Y-%m-%d') AS reference_period_end
      FROM declarations d
      INNER JOIN enrollments e ON e.id = d.enrollment_id
      INNER JOIN courses co ON co.id = e.course_id
      LEFT JOIN generated_documents gd ON gd.id = d.generated_document_id
      WHERE e.student_id = ?

      UNION ALL

      SELECT
        'certificate' AS kind, c.id, 'certificate' AS type, c.enrollment_id,
        c.verification_code, c.status, c.created_at, gd.status AS document_status,
        co.name AS course_name,
        CAST(NULL AS CHAR) AS reference_period_start,
        CAST(NULL AS CHAR) AS reference_period_end
      FROM certificates c
      INNER JOIN enrollments e ON e.id = c.enrollment_id
      INNER JOIN courses co ON co.id = e.course_id
      LEFT JOIN generated_documents gd ON gd.id = c.generated_document_id
      WHERE e.student_id = ?

      ORDER BY created_at DESC
    `,
    [studentId, studentId]
  );

  return rows.map((row) => ({
    kind: row.kind,
    id: String(row.id),
    type: row.type,
    enrollmentId: row.enrollment_id,
    courseName: row.course_name,
    verificationCode: row.verification_code,
    status: row.status,
    documentStatus: row.document_status,
    canDownload: row.status === "active" && row.document_status === "ready",
    createdAt: row.created_at,
    referencePeriodStart: row.reference_period_start || null,
    referencePeriodEnd: row.reference_period_end || null,
  }));
}

module.exports = { listMyAcademicDocuments };

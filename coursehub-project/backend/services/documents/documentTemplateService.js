/**
 * Leitura/registro de document_templates. Nesta fase não existe editor
 * visual (a spec do usuário pede para preferir templates controlados
 * em código quando um editor aumentaria demais o risco) -- o único
 * "conteúdo" gravado é template_path, resolvido em código para um
 * módulo de backend/services/documents/templates/ que exporta
 * { version, render }.
 *
 * "Só uma versão ativa por tipo" é regra de aplicação (não há
 * constraint de banco para isso, mesmo padrão de legalVersions.js).
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

async function getActiveTemplate(db, documentType) {
  const [rows] = await db
    .promise()
    .query(
      `SELECT id, document_type, name, version, template_path, status
       FROM document_templates
       WHERE document_type = ? AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [documentType]
    );

  if (rows.length === 0) {
    throw createServiceError(`Nenhum template ativo encontrado para "${documentType}".`, 500);
  }

  return rows[0];
}

/**
 * Cria uma nova versão para um document_type. Antes de ativar,
 * "aposenta" a versão ativa anterior (transição explícita, nunca duas
 * linhas 'active' simultâneas para o mesmo tipo). Só exercitado pelo
 * seed inicial nesta fase -- nenhum editor admin chama isto ainda.
 */
async function createTemplateVersion(
  connection,
  { documentType, name, version, templatePath, createdByUserId = null, activate = true }
) {
  if (activate) {
    await connection.query(
      `UPDATE document_templates SET status = 'retired', updated_at = NOW()
       WHERE document_type = ? AND status = 'active'`,
      [documentType]
    );
  }

  const [result] = await connection.query(
    `INSERT INTO document_templates (document_type, name, version, template_path, status, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [documentType, name, version, templatePath, activate ? "active" : "draft", createdByUserId]
  );

  return result.insertId;
}

module.exports = {
  getActiveTemplate,
  createTemplateVersion,
};

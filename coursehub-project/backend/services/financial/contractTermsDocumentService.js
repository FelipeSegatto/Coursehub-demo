/**
 * Persistência do documento de termos do contrato -- gera o HTML uma
 * única vez (na criação, ou no backfill para contratos legados) e
 * nunca regenera depois. Ler é só buscar o que já está gravado.
 */
const {
  CONTRACT_TERMS_TEMPLATE_VERSION,
  renderContractTermsDocument,
} = require("./contractTermsTemplate");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Gera e grava o documento congelado para um contrato -- roda DENTRO
 * da transação do chamador (mesma conexão que acabou de criar o
 * contrato/fatura/contratante), então o documento nasce atomicamente
 * junto com o contrato, nunca como um passo separado que poderia
 * falhar/ficar dessincronizado.
 *
 * `runner.query` é usado (não .execute) para aceitar tanto uma
 * conexão de transação quanto db.promise() diretamente -- o backfill
 * de contratos legados chama isso fora de uma transação de negócio
 * nova, só para preencher o histórico.
 */
async function generateAndStoreContractTermsDocument(runner, documentData) {
  const html = renderContractTermsDocument(documentData);

  await runner.query(
    `
      INSERT INTO contract_terms_documents
        (financial_contract_id, template_version, content_html, generated_at, created_at)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE financial_contract_id = financial_contract_id
    `,
    [documentData.contract.id, CONTRACT_TERMS_TEMPLATE_VERSION, html]
  );

  return { templateVersion: CONTRACT_TERMS_TEMPLATE_VERSION };
}

/**
 * GET -- devolve o HTML exatamente como foi congelado. Nunca
 * re-renderiza a partir do template atual.
 */
async function getContractTermsDocumentHtml(db, contractId) {
  const normalizedContractId = Number(contractId);

  if (!Number.isInteger(normalizedContractId) || normalizedContractId <= 0) {
    throw createServiceError("ID do contrato inválido.", 400);
  }

  const [rows] = await db
    .promise()
    .query(`SELECT content_html FROM contract_terms_documents WHERE financial_contract_id = ? LIMIT 1`, [
      normalizedContractId,
    ]);

  if (rows.length === 0) {
    throw createServiceError(
      "Este contrato ainda não possui um documento de termos gerado.",
      404
    );
  }

  return rows[0].content_html;
}

module.exports = {
  createServiceError,
  generateAndStoreContractTermsDocument,
  getContractTermsDocumentHtml,
};

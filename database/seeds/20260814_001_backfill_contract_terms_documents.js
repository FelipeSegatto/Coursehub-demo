/**
 * Backfill (não é um seed de dados fictícios -- gera o documento de
 * termos congelado para contratos que já existiam antes da feature):
 * para cada financial_contracts sem uma linha em
 * contract_terms_documents, renderiza o HTML a partir do snapshot já
 * gravado no próprio contrato (nunca relê course_pricing_plans) e
 * grava.
 *
 * Idempotente: contratos que já têm documento são pulados
 * (INSERT ... ON DUPLICATE KEY UPDATE no-op, ver
 * contractTermsDocumentService.js). Rodar de novo depois de criar
 * contratos novos só preenche os que ainda não têm.
 *
 * Uso: node database/seeds/20260814_001_backfill_contract_terms_documents.js
 */
// db.js já carrega o .env do backend por conta própria (require("dotenv").config()
// no topo do arquivo) -- não precisa duplicar aqui.
const db = require("../../coursehub-project/backend/db");
const {
  generateAndStoreContractTermsDocument,
} = require("../../coursehub-project/backend/services/financial/contractTermsDocumentService");

async function run() {
  const [contracts] = await db.promise().query(`
    SELECT
      fc.id, fc.plan_name, fc.billing_type, fc.total_amount, fc.monthly_payment_count,
      fc.monthly_payment_amount, fc.created_at, fc.activation_invoice_id,
      fc.contracting_party_name, fc.contracting_party_document, fc.contracting_party_email,
      fc.contracting_party_phone, fc.contracting_party_address,
      co.name AS course_name,
      s.name AS student_name, s.cpf AS student_cpf
    FROM financial_contracts fc
    INNER JOIN courses co ON co.id = fc.course_id
    INNER JOIN students s ON s.id = fc.student_id
    WHERE NOT EXISTS (
      SELECT 1 FROM contract_terms_documents ctd WHERE ctd.financial_contract_id = fc.id
    )
  `);

  console.log(`${contracts.length} contrato(s) sem documento de termos. Gerando...`);

  let generated = 0;

  for (const contract of contracts) {
    let firstInvoice = { amount: contract.total_amount, dueDate: null, description: contract.plan_name };

    if (contract.activation_invoice_id) {
      const [invoiceRows] = await db
        .promise()
        .query(`SELECT amount, due_date, description FROM invoices WHERE id = ? LIMIT 1`, [
          contract.activation_invoice_id,
        ]);

      if (invoiceRows.length > 0) {
        firstInvoice = {
          amount: invoiceRows[0].amount,
          dueDate: invoiceRows[0].due_date,
          description: invoiceRows[0].description,
        };
      }
    } else {
      // Contrato legado sem activation_invoice_id (raro, mas
      // possível para dados antigos demais) -- usa a fatura mais
      // antiga como melhor aproximação honesta, mesma lógica do
      // backfill de 20260813_009.
      const [invoiceRows] = await db.promise().query(
        `SELECT amount, due_date, description FROM invoices WHERE financial_contract_id = ? ORDER BY id ASC LIMIT 1`,
        [contract.id]
      );

      if (invoiceRows.length > 0) {
        firstInvoice = {
          amount: invoiceRows[0].amount,
          dueDate: invoiceRows[0].due_date,
          description: invoiceRows[0].description,
        };
      }
    }

    const address = contract.contracting_party_address
      ? typeof contract.contracting_party_address === "string"
        ? JSON.parse(contract.contracting_party_address)
        : contract.contracting_party_address
      : null;

    await generateAndStoreContractTermsDocument(db.promise(), {
      contract: {
        id: contract.id,
        planName: contract.plan_name,
        billingType: contract.billing_type,
        totalAmount: contract.total_amount,
        monthlyPaymentCount: contract.monthly_payment_count,
        monthlyPaymentAmount: contract.monthly_payment_amount,
        createdAt: contract.created_at,
      },
      course: { name: contract.course_name },
      contractingParty: {
        name: contract.contracting_party_name,
        document: contract.contracting_party_document,
        email: contract.contracting_party_email,
        phone: contract.contracting_party_phone,
        address,
      },
      student: {
        name: contract.student_name,
        document: contract.student_cpf,
      },
      firstInvoice,
    });

    generated += 1;
    console.log(`  contrato #${contract.id} — documento gerado.`);
  }

  console.log(`Concluído: ${generated} documento(s) gerado(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Falha no backfill:", error);
  process.exit(1);
});

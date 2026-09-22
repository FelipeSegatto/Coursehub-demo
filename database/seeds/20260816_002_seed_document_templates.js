/**
 * Seed inicial de document_templates (Fase 0/1 da geração de PDFs):
 * registra a versão 1.0.0 ativa dos 3 tipos de documento financeiro
 * (contrato, 2ª via de fatura, recibo). Não contém nenhum dado
 * pessoal -- apenas metadados de template.
 *
 * template_path aponta para o módulo (relativo a
 * backend/services/documents/templates/) que exporta { version, render }.
 * A leitura desses templates pelo worker é feita por
 * backend/services/documents/documentTemplateService.js.
 *
 * Idempotente: UNIQUE(document_type, version) via INSERT IGNORE --
 * rodar de novo depois que os templates já existem não duplica nada
 * nem sobrescreve uma versão já usada por um documento emitido.
 *
 * Uso: node database/seeds/20260816_002_seed_document_templates.js
 */
const db = require("../../coursehub-project/backend/db");

const TEMPLATES = [
  {
    documentType: "financial_contract",
    name: "Contrato de prestação de serviços educacionais",
    version: "1.0.0",
    templatePath: "financial/financialContractDocumentTemplate",
  },
  {
    documentType: "invoice_copy",
    name: "2ª via de fatura",
    version: "1.0.0",
    templatePath: "financial/invoiceCopyDocumentTemplate",
  },
  {
    documentType: "payment_receipt",
    name: "Recibo de pagamento",
    version: "1.0.0",
    templatePath: "financial/paymentReceiptDocumentTemplate",
  },
];

async function run() {
  let inserted = 0;

  for (const template of TEMPLATES) {
    const [result] = await db.promise().query(
      `INSERT IGNORE INTO document_templates
        (document_type, name, version, template_path, status, created_by_user_id)
       VALUES (?, ?, ?, ?, 'active', NULL)`,
      [template.documentType, template.name, template.version, template.templatePath]
    );

    if (result.affectedRows > 0) {
      inserted += 1;
      console.log(`  ${template.documentType} v${template.version} — inserido.`);
    } else {
      console.log(`  ${template.documentType} v${template.version} — já existia, ignorado.`);
    }
  }

  console.log(`Concluído: ${inserted} template(s) novo(s) inserido(s).`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Falha ao semear document_templates:", error);
  process.exit(1);
});

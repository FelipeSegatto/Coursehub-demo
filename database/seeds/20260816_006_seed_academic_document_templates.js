/**
 * Seed inicial de document_templates para a Fase 2 (documentos
 * acadêmicos): registra a versão 1.0.0 ativa dos 4 tipos de documento
 * (3 declarações + certificado). Mesmo padrão de
 * 20260816_002_seed_document_templates.js. Sem dados pessoais.
 *
 * Uso: node database/seeds/20260816_006_seed_academic_document_templates.js
 */
const db = require("../../coursehub-project/backend/db");

const TEMPLATES = [
  {
    documentType: "enrollment_declaration",
    name: "Declaração de matrícula",
    version: "1.0.0",
    templatePath: "academic/enrollmentDeclarationTemplate",
  },
  {
    documentType: "attendance_declaration",
    name: "Declaração de frequência",
    version: "1.0.0",
    templatePath: "academic/attendanceDeclarationTemplate",
  },
  {
    documentType: "completion_declaration",
    name: "Declaração de conclusão",
    version: "1.0.0",
    templatePath: "academic/completionDeclarationTemplate",
  },
  {
    documentType: "certificate",
    name: "Certificado de conclusão",
    version: "1.0.0",
    templatePath: "academic/certificateTemplate",
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
  console.error("Falha ao semear document_templates acadêmicos:", error);
  process.exit(1);
});

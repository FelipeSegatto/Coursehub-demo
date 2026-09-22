-- CourseHub
-- Migration: create contract_terms_documents
-- Date: 2026-08-14
-- Feature: documento de termos do contrato (congelado na criação)
-- MySQL: 8.0+
--
-- Purpose:
--   Guarda o HTML COMPLETO do "Contrato de Prestação de Serviços
--   Educacionais" no exato estado em que foi apresentado/aceito no
--   momento da criação do contrato -- nunca re-renderizado a partir
--   do template atual. Isso garante que uma mudança futura no texto
--   do boilerplate (services/financial/contractTermsTemplate.js)
--   nunca altera, nem visualmente, um contrato já emitido.
--
-- Domain rules:
--   - Um financial_contract tem no máximo um documento (UNIQUE).
--   - template_version registra qual versão do texto gerou aquele
--     HTML -- metadado de auditoria/depuração; o conteúdo em si já
--     está congelado em content_html, então mudar o template depois
--     nunca precisa (nem deve) re-gravar linhas existentes.
--   - Sem UPDATE previsto neste fluxo: se um contrato precisar de um
--     documento diferente (ex: aditivo), isso é uma nova linha
--     conceitual em uma eventual tabela de aditivos, não uma edição
--     deste registro -- mantém o mesmo princípio de nunca alterar
--     retroativamente um documento já emitido.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE contract_terms_documents (
  id INT NOT NULL AUTO_INCREMENT,

  financial_contract_id INT NOT NULL,

  template_version VARCHAR(20) NOT NULL,
  content_html LONGTEXT NOT NULL,

  generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_contract_terms_document_contract (financial_contract_id),

  CONSTRAINT fk_contract_terms_document_contract
    FOREIGN KEY (financial_contract_id)
    REFERENCES financial_contracts(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'contract_terms_documents' AS table_name, COUNT(*) AS row_count FROM contract_terms_documents;

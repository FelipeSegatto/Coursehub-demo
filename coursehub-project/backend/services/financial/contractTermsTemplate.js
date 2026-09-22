/**
 * Estrutura genérica do "Contrato de Prestação de Serviços
 * Educacionais" — recebe os dados reais do plano contratado, do
 * contratante/aluno e da instituição, e devolve o HTML completo do
 * documento.
 *
 * Conectado à criação de contrato (contractCreationService.js) e ao
 * backfill dos contratos legados (database/seeds/20260814_001_...).
 * O HTML é congelado no momento da geração e nunca re-renderizado --
 * mudar o texto abaixo nunca altera um documento já gravado em
 * contract_terms_documents, só afeta contratos criados depois.
 *
 * CONTRACT_TERMS_TEMPLATE_VERSION existe desde já para já nascer
 * pronto para o modelo "congelar o HTML na criação, registrar qual
 * versão do template gerou aquele HTML" -- suba este número sempre
 * que o TEXTO deste arquivo mudar de forma que afete contratos
 * futuros (não precisa subir por causa de ajuste visual/CSS).
 */

const { normalizeDocumentNumber } = require("../../utils/documentValidation");
const { getInstitutionProfile } = require("../../config/institutionConfig");

const CONTRACT_TERMS_TEMPLATE_VERSION = "1.1.0";

const INSTITUTION = getInstitutionProfile();

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function formatCurrency(value) {
  const numeric = Number(value ?? 0);

  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "[data não informada]";

  const date = typeof value === "string" ? new Date(value.slice(0, 10) + "T00:00:00") : value;

  if (Number.isNaN(date?.getTime?.())) return "[data não informada]";

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDocument(value) {
  const digits = normalizeDocumentNumber(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return value || "[documento não informado]";
}

function formatAddress(address) {
  if (!address) return "[endereço não informado]";

  const parts = [address.line, address.city, address.state, address.zipCode].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "[endereço não informado]";
}

const BILLING_TYPE_TEXT = {
  one_time: "pagamento único",
  monthly_plan: "plano com mensalidades",
};

/**
 * Monta a descrição das condições comerciais (cláusula 2) a partir
 * do snapshot do plano gravado no contrato -- nunca relê
 * course_pricing_plans, o snapshot já é a fonte de verdade imutável.
 */
function buildPlanClauseText({ billingType, totalAmount, monthlyPaymentCount, monthlyPaymentAmount }) {
  if (billingType === "monthly_plan" && monthlyPaymentCount) {
    return `${formatCurrency(totalAmount)}, parcelado em ${monthlyPaymentCount}x de ${formatCurrency(
      monthlyPaymentAmount
    )}`;
  }

  return `${formatCurrency(totalAmount)}, em pagamento único`;
}

/**
 * data: {
 *   contract: { id, planName, billingType, totalAmount, monthlyPaymentCount,
 *               monthlyPaymentAmount, startDate, createdAt },
 *   course: { name },
 *   contractingParty: { name, partyType, document, email, phone, address },
 *   student: { name, document, email, birthDate },  // igual a contractingParty quando for o mesmo aluno
 *   firstInvoice: { amount, dueDate, description },
 * }
 */
function renderContractTermsDocument(data) {
  const { contract, course, contractingParty, student, firstInvoice } = data;

  // Documentos podem chegar em formatos diferentes (um só dígitos,
  // outro com máscara) dependendo de onde vieram -- normaliza antes
  // de comparar, ou "o próprio aluno" nunca seria reconhecido como
  // tal.
  const isSelfContracting =
    contractingParty?.document &&
    student?.document &&
    normalizeDocumentNumber(contractingParty.document) === normalizeDocumentNumber(student.document);

  const planClauseText = buildPlanClauseText(contract);
  const billingTypeText = BILLING_TYPE_TEXT[contract.billingType] || contract.billingType;

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Contrato de Prestação de Serviços Educacionais — ${escapeHtml(String(contract.id))}</title>
      </head>
      <body style="font-family: Georgia, 'Times New Roman', serif; color:#1a1a1a; max-width:720px; margin:0 auto; padding:48px 32px; line-height:1.65; font-size:14.5px;">

        <header style="text-align:center; margin-bottom:36px;">
          <p style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#666; margin:0 0 6px;">${escapeHtml(
            INSTITUTION.tradeName
          )}</p>
          <h1 style="font-size:20px; margin:0; letter-spacing:-0.01em;">Contrato de Prestação de Serviços Educacionais</h1>
          <p style="font-size:12px; color:#666; margin:8px 0 0;">Contrato nº ${escapeHtml(
            String(contract.id)
          )} · Versão do modelo ${escapeHtml(CONTRACT_TERMS_TEMPLATE_VERSION)} · Emitido em ${formatDate(
    contract.createdAt
  )}</p>
        </header>

        <section style="margin-bottom:24px;">
          <p style="margin:0 0 10px;"><strong>CONTRATADA:</strong> ${escapeHtml(
            INSTITUTION.legalName
          )}, inscrita no CNPJ sob o nº ${escapeHtml(INSTITUTION.cnpj)}, com sede em ${escapeHtml(
    INSTITUTION.address
  )}, doravante denominada <strong>CONTRATADA</strong>.</p>

          <p style="margin:0 0 10px;"><strong>CONTRATANTE:</strong> ${escapeHtml(
            contractingParty.name
          )}, portador(a) do documento nº ${escapeHtml(formatDocument(contractingParty.document))},
          com e-mail de contato ${escapeHtml(contractingParty.email)} e endereço em ${escapeHtml(
    formatAddress(contractingParty.address)
  )}, doravante denominado(a) <strong>CONTRATANTE</strong>.</p>

          ${
            !isSelfContracting
              ? `<p style="margin:0;"><strong>ALUNO(A) BENEFICIÁRIO(A):</strong> ${escapeHtml(
                  student.name
                )}, portador(a) do documento nº ${escapeHtml(
                  formatDocument(student.document)
                )}, matriculado(a) no curso objeto deste contrato.</p>`
              : `<p style="margin:0; color:#555;">O(A) CONTRATANTE é também o(a) próprio(a) aluno(a) beneficiário(a) do curso.</p>`
          }
        </section>

        <p style="margin:0 0 20px;">As partes acima identificadas têm, entre si, justo e acertado o presente contrato, que se regerá pelas cláusulas seguintes:</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 1ª — Do Objeto</h2>
        <p style="margin:0 0 14px;">O presente contrato tem por objeto a prestação, pela CONTRATADA, de serviços educacionais referentes ao curso <strong>"${escapeHtml(
          course.name
        )}"</strong>, na modalidade a distância, conforme plano comercial descrito na Cláusula 2ª.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 2ª — Do Plano e do Valor</h2>
        <p style="margin:0 0 14px;">O plano contratado é o <strong>"${escapeHtml(
          contract.planName
        )}"</strong>, modalidade de cobrança em ${escapeHtml(
    billingTypeText
  )}, no valor total de ${planClauseText}. O valor aqui pactuado é o vigente na data de celebração deste contrato e não sofre alteração retroativa em razão de eventuais mudanças posteriores nos planos comerciais da CONTRATADA.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 3ª — Da Primeira Cobrança</h2>
        <p style="margin:0 0 14px;">A primeira cobrança referente a este contrato é de ${formatCurrency(
          firstInvoice.amount
        )}, com vencimento em ${formatDate(firstInvoice.dueDate)}${
    firstInvoice.description ? `, referente a "${escapeHtml(firstInvoice.description)}"` : ""
  }.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 4ª — Da Matrícula e da Liberação de Acesso</h2>
        <p style="margin:0 0 14px;">A matrícula do(a) aluno(a) beneficiário(a) e a liberação de acesso à plataforma e aos conteúdos do curso ficam condicionadas à confirmação do pagamento da cobrança referida na Cláusula 3ª. Até a confirmação do pagamento, este contrato encontra-se em situação de <em>aguardando pagamento</em>, sem que isso implique qualquer acesso ao curso.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 5ª — Das Obrigações da CONTRATADA</h2>
        <p style="margin:0 0 14px;">Disponibilizar o conteúdo do curso contratado, conforme carga horária e programa vigentes; manter canal de suporte (${escapeHtml(
          INSTITUTION.supportChannel
        )}) para dúvidas administrativas e acadêmicas; emitir os comprovantes fiscais cabíveis.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 6ª — Das Obrigações do CONTRATANTE</h2>
        <p style="margin:0 0 14px;">Efetuar o pagamento das cobranças nos prazos e formas pactuados; manter seus dados cadastrais atualizados junto à CONTRATADA; fazer uso da plataforma em conformidade com os termos de uso vigentes.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 7ª — Da Inadimplência</h2>
        <p style="margin:0 0 14px;">O atraso no pagamento de qualquer cobrança poderá acarretar a suspensão do acesso ao curso, observados os prazos e comunicações previstos na política de cobrança da CONTRATADA, sem prejuízo da cobrança dos valores em aberto.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 8ª — Do Cancelamento</h2>
        <p style="margin:0 0 14px;">Este contrato poderá ser cancelado a pedido do CONTRATANTE ou por decisão administrativa da CONTRATADA, observadas as condições de reembolso vigentes à data do cancelamento. O cancelamento anterior à confirmação do pagamento da primeira cobrança não gera matrícula nem qualquer acesso ao curso.</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 9ª — Da Proteção de Dados Pessoais</h2>
        <p style="margin:0 0 14px;">Os dados pessoais informados neste contrato serão tratados pela CONTRATADA exclusivamente para as finalidades de execução deste contrato, comunicação com o CONTRATANTE e cumprimento de obrigações legais, nos termos da Lei nº 13.709/2018 (LGPD).</p>

        <h2 style="font-size:14px; margin:22px 0 8px;">Cláusula 10ª — Do Foro</h2>
        <p style="margin:0 0 28px;">Fica eleito o foro do domicílio do CONTRATANTE para dirimir quaisquer questões oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

        <p style="margin:0 0 32px;">E, por estarem assim justas e contratadas, as partes aceitam eletronicamente os termos deste instrumento no ato da confirmação do pagamento referido na Cláusula 3ª.</p>

        <table style="width:100%; margin-top:40px; border-collapse:collapse;">
          <tr>
            <td style="width:50%; padding-top:28px; border-top:1px solid #999; font-size:12.5px;">
              ${escapeHtml(INSTITUTION.tradeName)}<br />CONTRATADA
            </td>
            <td style="width:50%; padding-top:28px; border-top:1px solid #999; font-size:12.5px; text-align:right;">
              ${escapeHtml(contractingParty.name)}<br />CONTRATANTE
            </td>
          </tr>
        </table>

        <p style="margin-top:40px; font-size:11px; color:#999; text-align:center;">Documento gerado eletronicamente — Contrato nº ${escapeHtml(
          String(contract.id)
        )} · Modelo v${escapeHtml(CONTRACT_TERMS_TEMPLATE_VERSION)}</p>
      </body>
    </html>
  `;
}

module.exports = {
  CONTRACT_TERMS_TEMPLATE_VERSION,
  INSTITUTION,
  renderContractTermsDocument,
};

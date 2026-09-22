const { test } = require("node:test");
const assert = require("node:assert/strict");

const financialContract = require("../../services/documents/templates/financial/financialContractDocumentTemplate");
const invoiceCopy = require("../../services/documents/templates/financial/invoiceCopyDocumentTemplate");
const paymentReceipt = require("../../services/documents/templates/financial/paymentReceiptDocumentTemplate");
const enrollmentDeclaration = require("../../services/documents/templates/academic/enrollmentDeclarationTemplate");
const attendanceDeclaration = require("../../services/documents/templates/academic/attendanceDeclarationTemplate");
const completionDeclaration = require("../../services/documents/templates/academic/completionDeclarationTemplate");
const certificate = require("../../services/documents/templates/academic/certificateTemplate");

const QR = "data:image/png;base64,AAAA";

function assertRenderable(mod, titleSnippet, data) {
  assert.equal(typeof mod.render, "function");
  assert.equal(mod.version, "1.0.0");
  const html = mod.render(data);
  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes(titleSnippet));
}

test("every official document template renders HTML without throwing", () => {
  assertRenderable(financialContract, "Contrato", {
    contract: {
      id: 1,
      planName: "Plano",
      billingType: "one_time",
      totalAmount: 100,
      monthlyPaymentCount: null,
      monthlyPaymentAmount: null,
      startDate: "2026-09-01",
      createdAt: "2026-09-01",
      activatedAt: "2026-09-01",
      stage: "active",
    },
    course: { name: "React do Zero" },
    contractingParty: {
      name: "Ana",
      document: "52998224725",
      email: "ana@example.com",
      phone: "11999999999",
      address: { line: "Rua A", city: "São Paulo", state: "SP", zipCode: "01310-100" },
    },
    student: { name: "Ana", document: "52998224725" },
    firstInvoice: { amount: 100, dueDate: "2026-09-10", description: "Ativação" },
  });

  assertRenderable(invoiceCopy, "2ª via de fatura", {
    invoice: {
      id: 1,
      description: "Mensalidade",
      originalAmount: 100,
      amount: 100,
      discountAmount: 0,
      dueDate: "2026-09-10",
      status: "pending",
      paidAt: null,
    },
    contract: { id: 1, planName: "Plano" },
    course: { name: "React do Zero" },
    contractingParty: { name: "Ana", email: "ana@example.com" },
    student: { name: "Ana" },
  });

  assertRenderable(paymentReceipt, "Recibo", {
    payment: {
      id: 1,
      amount: 100,
      currency: "BRL",
      paidAt: "2026-09-10T12:00:00Z",
      paymentMethod: "pix",
      safeReference: "PIX-1",
    },
    invoice: { id: 1, description: "Ativação" },
    contract: { id: 1, planName: "Plano" },
    course: { name: "React do Zero" },
    payer: { name: "Ana", document: "52998224725", email: "ana@example.com" },
  });

  assertRenderable(enrollmentDeclaration, "Declaração de Matrícula", {
    student: { name: "Ana", document: "52998224725" },
    course: { name: "React do Zero", workloadHours: 40 },
    enrollment: { status: "active", enrolledAt: "2026-09-01" },
    verificationQrDataUri: QR,
    verificationCode: "ABC123",
    issuedAt: "2026-09-18",
  });

  assertRenderable(attendanceDeclaration, "Declaração de Frequência", {
    student: { name: "Ana", document: "52998224725" },
    course: { name: "React do Zero" },
    period: { start: "2026-08-01", end: "2026-08-31" },
    attendance: { totalSessions: 8, presentSessions: 7, rate: 87.5 },
    verificationQrDataUri: QR,
    verificationCode: "ABC123",
    issuedAt: "2026-09-18",
  });

  assertRenderable(completionDeclaration, "Declaração de Conclusão", {
    student: { name: "Ana", document: "52998224725" },
    course: { name: "React do Zero", workloadHours: 40 },
    enrollment: { completedAt: "2026-09-01" },
    eligibility: { requirements: [{ label: "Frequência", required: "75%", actual: "90%" }] },
    verificationQrDataUri: QR,
    verificationCode: "ABC123",
    issuedAt: "2026-09-18",
  });

  assertRenderable(certificate, "Certificado", {
    student: { name: "Ana" },
    course: { name: "React do Zero", workloadHours: 40 },
    completedAt: "2026-09-01",
    verificationUrl: "http://localhost:5173/documentos/verificar/ABC123",
    verificationQrDataUri: QR,
    verificationCode: "ABC123",
  });
});

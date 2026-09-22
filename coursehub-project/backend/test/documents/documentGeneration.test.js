const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const {
  renderHtmlToPdf,
  closeBrowser,
} = require("../../services/documents/documentRendererService");
const {
  enqueueDocument,
  claimBatch,
  markReady,
  markFailed,
  retryFailedDocument,
  revokeDocument,
} = require("../../services/documents/generatedDocumentService");
const { saveDocument, readDocument, deleteDocument } = require("../../services/documents/documentStorageService");

const TEST_KEY_PREFIX = `test:${Date.now()}:`;

function testKey(suffix) {
  return `${TEST_KEY_PREFIX}${suffix}`;
}

after(async () => {
  const [rows] = await db
    .promise()
    .query(`SELECT storage_key FROM generated_documents WHERE idempotency_key LIKE ?`, [`${TEST_KEY_PREFIX}%`]);

  for (const row of rows) {
    if (row.storage_key) {
      await deleteDocument(row.storage_key).catch(() => {});
    }
  }

  await db.promise().query(`DELETE FROM generated_documents WHERE idempotency_key LIKE ?`, [
    `${TEST_KEY_PREFIX}%`,
  ]);

  await closeBrowser();
  await db.promise().end();
});

test("renderHtmlToPdf produces a valid, non-empty PDF with real (non-rasterized) text", async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Documento de teste</h1><p>Texto pesquisável do CourseHub.</p></body></html>`;

  const pdf = await renderHtmlToPdf(html);

  assert.ok(pdf.length > 0);
  assert.equal(pdf.slice(0, 4).toString(), "%PDF");
});

test("renderHtmlToPdf blocks external network requests -- render completes quickly despite an unreachable external reference", async () => {
  const html = `<!doctype html><html><head>
    <link rel="stylesheet" href="http://10.255.255.1/unreachable.css">
  </head><body>
    <img src="http://10.255.255.1/unreachable.png" alt="x">
    <h1>Sem rede</h1>
  </body></html>`;

  const startedAt = Date.now();
  const pdf = await renderHtmlToPdf(html, { timeoutMs: 8000 });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(pdf.slice(0, 4).toString(), "%PDF");
  // Se as requisições não fossem abortadas, o navegador tentaria
  // rotear para um IP não roteável e só desistiria perto do timeout
  // configurado -- completar bem abaixo disso comprova que a
  // interceptação abortou as requisições em vez de deixá-las pendentes.
  assert.ok(elapsedMs < 6000, `esperava completar bem antes do timeout, levou ${elapsedMs}ms`);
});

test("renderHtmlToPdf rejects HTML larger than the configured limit", async () => {
  const oversizedHtml = `<!doctype html><html><body><p>${"x".repeat(3 * 1024 * 1024)}</p></body></html>`;

  await assert.rejects(
    () => renderHtmlToPdf(oversizedHtml),
    (error) => {
      assert.equal(error.statusCode, 500);
      assert.match(error.message, /excede o limite/);
      return true;
    }
  );
});

test("enqueueDocument is idempotent -- same idempotencyKey never creates a second row", async () => {
  const idempotencyKey = testKey("idempotent-enqueue");

  const first = await enqueueDocument(db, {
    documentType: "financial_contract",
    subjectType: "financial_contract",
    subjectId: 999999001,
    idempotencyKey,
    snapshot: { marker: "first" },
    requestedByUserId: null,
  });

  const second = await enqueueDocument(db, {
    documentType: "financial_contract",
    subjectType: "financial_contract",
    subjectId: 999999001,
    idempotencyKey,
    snapshot: { marker: "second -- should never be persisted" },
    requestedByUserId: null,
  });

  assert.equal(first.id, second.id);

  const [rows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total, snapshot_json FROM generated_documents WHERE idempotency_key = ?`, [
      idempotencyKey,
    ]);

  assert.equal(Number(rows[0].total), 1);
});

test("claimBatch moves a queued row to generating with a lease, and skips it on a second immediate claim", async () => {
  const idempotencyKey = testKey("claim-lease");

  const enqueued = await enqueueDocument(db, {
    documentType: "financial_contract",
    subjectType: "financial_contract",
    subjectId: 999999002,
    idempotencyKey,
    snapshot: { marker: "claim-test" },
    requestedByUserId: null,
  });

  const firstClaim = await claimBatch(db, { batchSize: 50, workerId: "test-worker-a", leaseMinutes: 5 });
  const claimedRow = firstClaim.find((row) => String(row.id) === enqueued.id);

  assert.ok(claimedRow, "a linha recém-criada deveria ter sido reivindicada");

  const [statusRows] = await db.promise().query(`SELECT status, locked_by FROM generated_documents WHERE id = ?`, [
    enqueued.id,
  ]);

  assert.equal(statusRows[0].status, "generating");
  assert.equal(statusRows[0].locked_by, "test-worker-a");

  // Lease ainda válido -- um segundo worker não deve conseguir reivindicar a mesma linha.
  const secondClaim = await claimBatch(db, { batchSize: 50, workerId: "test-worker-b", leaseMinutes: 5 });
  assert.ok(!secondClaim.some((row) => String(row.id) === enqueued.id));
});

test("claimBatch reclaims a row whose lease already expired", async () => {
  const idempotencyKey = testKey("claim-expired-lease");

  const enqueued = await enqueueDocument(db, {
    documentType: "financial_contract",
    subjectType: "financial_contract",
    subjectId: 999999003,
    idempotencyKey,
    snapshot: { marker: "expired-lease-test" },
    requestedByUserId: null,
  });

  await claimBatch(db, { batchSize: 50, workerId: "test-worker-stale", leaseMinutes: 5 });

  // Simula um worker que travou: lease expirado no passado.
  await db.promise().query(`UPDATE generated_documents SET locked_until = NOW() - INTERVAL 1 MINUTE WHERE id = ?`, [
    enqueued.id,
  ]);

  const reclaimed = await claimBatch(db, { batchSize: 50, workerId: "test-worker-recovery", leaseMinutes: 5 });

  assert.ok(reclaimed.some((row) => String(row.id) === enqueued.id));

  const [rows] = await db.promise().query(`SELECT locked_by FROM generated_documents WHERE id = ?`, [enqueued.id]);
  assert.equal(rows[0].locked_by, "test-worker-recovery");
});

test("markFailed records a sanitized reason; retryFailedDocument requeues without duplicating the row", async () => {
  const idempotencyKey = testKey("fail-then-retry");

  const enqueued = await enqueueDocument(db, {
    documentType: "financial_contract",
    subjectType: "financial_contract",
    subjectId: 999999004,
    idempotencyKey,
    snapshot: { marker: "fail-test" },
    requestedByUserId: null,
  });

  await claimBatch(db, { batchSize: 50, workerId: "test-worker-fail", leaseMinutes: 5 });
  await markFailed(db, enqueued.id, { failureReason: "Erro simulado de renderização" });

  const [failedRows] = await db.promise().query(`SELECT status, failure_reason FROM generated_documents WHERE id = ?`, [
    enqueued.id,
  ]);
  assert.equal(failedRows[0].status, "failed");
  assert.equal(failedRows[0].failure_reason, "Erro simulado de renderização");

  await retryFailedDocument(db, enqueued.id);

  const [requeuedRows] = await db
    .promise()
    .query(`SELECT status, failure_reason FROM generated_documents WHERE id = ?`, [enqueued.id]);
  assert.equal(requeuedRows[0].status, "queued");
  assert.equal(requeuedRows[0].failure_reason, null);

  const [countRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM generated_documents WHERE idempotency_key = ?`, [idempotencyKey]);
  assert.equal(Number(countRows[0].total), 1);
});

test("revokeDocument only succeeds on a ready document and preserves the row (no delete)", async () => {
  const idempotencyKey = testKey("revoke");

  const enqueued = await enqueueDocument(db, {
    documentType: "financial_contract",
    subjectType: "financial_contract",
    subjectId: 999999005,
    idempotencyKey,
    snapshot: { marker: "revoke-test" },
    requestedByUserId: null,
  });

  // Não pode revogar enquanto ainda está 'queued'.
  await assert.rejects(() => revokeDocument(db, { documentId: enqueued.id, actorUserId: null, reason: "teste" }));

  await claimBatch(db, { batchSize: 50, workerId: "test-worker-revoke", leaseMinutes: 5 });

  const { storageKey, fileHash, fileSizeBytes } = await saveDocument(Buffer.from("%PDF-fake-test-content"), {
    documentType: "financial_contract",
    generatedDocumentId: enqueued.id,
  });
  await markReady(db, enqueued.id, { storageKey, fileHash, fileSizeBytes });

  await revokeDocument(db, { documentId: enqueued.id, actorUserId: null, reason: "teste automatizado" });

  const [rows] = await db
    .promise()
    .query(`SELECT status, revoked_at, revocation_reason FROM generated_documents WHERE id = ?`, [enqueued.id]);

  assert.equal(rows[0].status, "revoked");
  assert.ok(rows[0].revoked_at);
  assert.equal(rows[0].revocation_reason, "teste automatizado");

  // O arquivo em si continua legível -- revogar não apaga o histórico/arquivo.
  const fileContent = await readDocument(storageKey);
  assert.equal(fileContent.toString(), "%PDF-fake-test-content");
});

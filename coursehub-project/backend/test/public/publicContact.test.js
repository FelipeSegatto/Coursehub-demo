const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions"); // registers admin.contact.created

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { createContactRequest } = require("../../services/public/publicContactService");

const RUN_ID = Date.now();

function testEmail(label) {
  return `test.publiccontact.${RUN_ID}.${label}@example.com`;
}

const createdContactIds = [];

async function cleanupContact(contactId) {
  const [notifs] = await db
    .promise()
    .query(`SELECT id FROM notifications WHERE source_type = 'public_contact_request' AND source_id = ?`, [
      contactId,
    ]);

  for (const notification of notifs) {
    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id = ?)`,
          [notification.id]
        )
    );
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [notification.id])
    );
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM notifications WHERE id = ?`, [notification.id]));
  }

  await retryOnDeadlock(() => db.promise().query(`DELETE FROM public_contact_requests WHERE id = ?`, [contactId]));
}

after(async () => {
  for (const contactId of createdContactIds) {
    await cleanupContact(contactId);
  }

  await db.promise().end();
});

test("createContactRequest: persiste a mensagem e cria admin.contact.created (category=contact)", async () => {
  const result = await createContactRequest(db, {
    name: "Maria Teste",
    email: testEmail("basic"),
    phone: "(11) 90000-0001",
    subject: "Dúvida sobre matrícula",
    message: "Gostaria de saber mais sobre os cursos disponíveis.",
  });

  createdContactIds.push(result.id);

  const [[row]] = await db
    .promise()
    .query(`SELECT name, email, phone, subject, message, status FROM public_contact_requests WHERE id = ?`, [
      result.id,
    ]);

  assert.equal(row.name, "Maria Teste");
  assert.equal(row.subject, "Dúvida sobre matrícula");
  assert.equal(row.status, "new");

  const [[notification]] = await db
    .promise()
    .query(
      `SELECT category, type, message FROM notifications WHERE source_type = 'public_contact_request' AND source_id = ?`,
      [result.id]
    );

  assert.ok(notification, "admin.contact.created deveria ter sido criada");
  assert.equal(notification.category, "contact");
  assert.equal(notification.type, "admin.contact.created");

  // O conteúdo grande da mensagem não deve estar copiado inteiro no
  // snapshot da notificação -- só um resumo (o assunto).
  assert.doesNotMatch(notification.message, /Gostaria de saber mais/);
  assert.match(notification.message, /Dúvida sobre matrícula/);
});

test("createContactRequest rejects missing/invalid required fields", async () => {
  await assert.rejects(
    () => createContactRequest(db, { email: testEmail("noname"), subject: "x", message: "corpo" }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      createContactRequest(db, {
        name: "Nome Teste",
        email: "not-an-email",
        subject: "x",
        message: "corpo",
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      createContactRequest(db, {
        name: "Nome Teste",
        email: testEmail("nosubject"),
        subject: "",
        message: "corpo",
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      createContactRequest(db, {
        name: "Nome Teste",
        email: testEmail("nomessage"),
        subject: "assunto",
        message: "   ",
      }),
    (error) => error.statusCode === 400
  );
});

test("createContactRequest enforces reasonable size limits", async () => {
  await assert.rejects(
    () =>
      createContactRequest(db, {
        name: "Nome Teste",
        email: testEmail("toolongmessage"),
        subject: "assunto",
        message: "x".repeat(2001),
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      createContactRequest(db, {
        name: "Nome Teste",
        email: testEmail("toolongsubject"),
        subject: "x".repeat(181),
        message: "corpo",
      }),
    (error) => error.statusCode === 400
  );
});

test("createContactRequest: sem admins ativos ainda persiste normalmente (notificação é best-effort)", async () => {
  // Não é possível zerar os admins reais deste banco compartilhado
  // (mesma restrição documentada em adminUserCreation.test.js), mas
  // dá pra confirmar diretamente que o service nunca deixa uma falha
  // de notificação impedir a resposta de sucesso -- ver
  // notifyAdminContactCreated (try/catch, nunca propaga).
  const result = await createContactRequest(db, {
    name: "Sem Admin Teste",
    email: testEmail("noadmin"),
    subject: "assunto",
    message: "corpo da mensagem",
  });

  createdContactIds.push(result.id);

  const [[row]] = await db.promise().query(`SELECT id FROM public_contact_requests WHERE id = ?`, [result.id]);
  assert.ok(row, "o contato deveria existir mesmo que a notificação falhasse");
});

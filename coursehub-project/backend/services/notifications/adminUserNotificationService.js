const { createNotificationEvent } = require("./notificationService");
const { resolveAllActiveAdmins } = require("./notificationRecipientResolvers");

/**
 * Shared dispatch for admin.user.created, called from every genuine
 * account-creation point (never the checkout-stub path -- see
 * eventDefinitions/adminUserCreated.js). Always called AFTER the
 * caller's own transaction has committed: user creation must never
 * fail or roll back because this notification-layer call has a
 * problem, so failures are logged, not propagated.
 */
async function notifyAdminUserCreated(db, { userId, userName, userRole, origin = null, actorUserId = null }) {
  try {
    const admins = await resolveAllActiveAdmins(db.promise());

    if (admins.length === 0) {
      return;
    }

    await createNotificationEvent(db, {
      type: "admin.user.created",
      sourceType: "user",
      sourceId: userId,
      actorUserId,
      context: { userId, userName, userRole, origin },
      recipients: admins,
    });
  } catch (notificationError) {
    console.error("[notifyAdminUserCreated] falha ao notificar admins:", notificationError);
  }
}

/**
 * Same "resolveAllActiveAdmins + createNotificationEvent, never
 * propagate a failure" shape as notifyAdminUserCreated above, for the
 * public contact form (publicContactService.createContactRequest).
 * senderEmail is included so an admin can reply without opening the
 * record first, but the message body itself is deliberately NOT
 * copied here -- only subject, so a very large submission never gets
 * duplicated into the notification snapshot (see
 * eventDefinitions/adminContactCreated.js).
 */
async function notifyAdminContactCreated(db, { contactRequestId, senderName, senderEmail, subject }) {
  try {
    const admins = await resolveAllActiveAdmins(db.promise());

    if (admins.length === 0) {
      return;
    }

    await createNotificationEvent(db, {
      type: "admin.contact.created",
      sourceType: "public_contact_request",
      sourceId: contactRequestId,
      context: { contactRequestId, senderName, senderEmail, subject },
      recipients: admins,
    });
  } catch (notificationError) {
    console.error("[notifyAdminContactCreated] falha ao notificar admins:", notificationError);
  }
}

module.exports = { notifyAdminUserCreated, notifyAdminContactCreated };

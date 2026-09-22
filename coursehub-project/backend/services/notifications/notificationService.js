const {
  getNotificationType,
  assertRequiredContext,
  resolvePriority,
  EMAIL_POLICIES,
} = require("./notificationTypeRegistry");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * A recipient is either a system user ({ userId, email, ... }) or an
 * external contact with no CourseHub account ({ external: true,
 * email, name }) -- e.g. a contracting party billing email. External
 * recipients are deduplicated by email instead of userId, since they
 * have no id of their own.
 */
function normalizeRecipients(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw createServiceError("At least one recipient is required.", 400);
  }

  const byKey = new Map();

  for (const recipient of recipients) {
    if (!recipient?.email) {
      throw createServiceError("Every recipient requires a resolved email.", 400);
    }

    if (recipient.external) {
      const key = `external:${recipient.email}`;

      if (!byKey.has(key)) {
        byKey.set(key, { ...recipient, userId: null, external: true });
      }

      continue;
    }

    const userId = Number(recipient.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw createServiceError("Every recipient requires a valid userId.", 400);
    }

    const key = `user:${userId}`;

    if (!byKey.has(key)) {
      byKey.set(key, { ...recipient, userId, external: false });
    }
  }

  return Array.from(byKey.values());
}

/**
 * "essential" always gets an email row (opt-out is ignored).
 * "default_on" gets one unless the user explicitly disabled the
 * category. "default_off" only gets one if the user explicitly
 * enabled the category. Absence of a preference row always falls
 * back to the policy's own default -- this function never invents a
 * preference row, it only reads.
 */
async function resolveEmailEligibility(connection, { userId, category, emailPolicy }) {
  if (emailPolicy === "essential") {
    return { eligible: true, skipReason: null };
  }

  const [rows] = await connection.query(
    `SELECT email_enabled FROM notification_preferences WHERE user_id = ? AND category = ? LIMIT 1`,
    [userId, category]
  );

  const preference = rows[0] || null;

  if (emailPolicy === "default_on") {
    const eligible = !preference || Boolean(preference.email_enabled);

    return { eligible, skipReason: eligible ? null : "user_opted_out" };
  }

  // default_off
  const eligible = Boolean(preference) && Boolean(preference.email_enabled);

  return { eligible, skipReason: eligible ? null : "default_off_not_opted_in" };
}

/**
 * Creates a notification event + its recipients + their delivery
 * rows in a single transaction. Idempotent on
 * (type -> buildDeduplicationKey(context)): a second call with the
 * same logical event is a no-op that returns the existing
 * notification untouched -- it never adds recipients on a retry,
 * matching the "an event never rewrites/re-fans-out" rule.
 *
 * `recipients` must already be resolved by the caller (userId, role,
 * name, email) -- domain-specific "who should be notified" logic
 * lives in notificationRecipientResolvers.js, not here.
 *
 * Pass `connection` when the notification must be created inside an
 * already-open business transaction (e.g. publishing an activity):
 * this function then reuses that connection and does NOT call
 * beginTransaction/commit/rollback itself -- the caller owns the
 * transaction boundary, matching this codebase's "runner can be the
 * pool or an existing connection" convention (see
 * classAccessService.js). Without `connection`, it manages its own
 * transaction exactly as before (used by callers where creating the
 * notification IS the entire operation).
 */
async function createNotificationEvent(
  db,
  {
    type,
    sourceType,
    sourceId,
    actorUserId,
    courseId,
    classId,
    context = {},
    recipients,
    excludeActor = true,
    connection: externalConnection,
  }
) {
  const definition = getNotificationType(type);

  assertRequiredContext(definition, context);

  const normalizedRecipients = normalizeRecipients(recipients).filter(
    (recipient) => !excludeActor || Number(recipient.userId) !== Number(actorUserId)
  );

  if (normalizedRecipients.length === 0) {
    throw createServiceError(
      `Notification type "${type}" resolved to zero recipients after excluding the actor.`,
      400
    );
  }

  const deduplicationKey = definition.buildDeduplicationKey(context);

  if (!deduplicationKey || typeof deduplicationKey !== "string") {
    throw createServiceError(
      `Notification type "${type}" produced an invalid deduplication key.`,
      500
    );
  }

  const priority = resolvePriority(definition, context);

  const ownsTransaction = !externalConnection;
  const connection = externalConnection || (await db.promise().getConnection());

  try {
    if (ownsTransaction) {
      await connection.beginTransaction();
    }

    let notificationId;
    let deduplicated = false;

    try {
      const [insertResult] = await connection.query(
        `
          INSERT INTO notifications
          (type, category, priority, title, message, source_type, source_id,
           actor_user_id, course_id, class_id, deduplication_key, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          type,
          definition.category,
          priority,
          definition.buildTitle(context, null),
          definition.buildMessage(context, null),
          sourceType,
          sourceId ?? null,
          actorUserId ?? null,
          courseId ?? null,
          classId ?? null,
          deduplicationKey,
          context.metadata ? JSON.stringify(context.metadata) : null,
        ]
      );

      notificationId = insertResult.insertId;
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") {
        throw error;
      }

      deduplicated = true;

      const [existingRows] = await connection.query(
        `SELECT id FROM notifications WHERE deduplication_key = ? LIMIT 1`,
        [deduplicationKey]
      );

      if (existingRows.length === 0) {
        throw createServiceError(
          "Duplicate key reported but no existing notification found.",
          500
        );
      }

      notificationId = existingRows[0].id;
    }

    if (deduplicated) {
      if (ownsTransaction) {
        await connection.commit();
      }

      return { notificationId, deduplicated: true, recipientIds: [] };
    }

    const recipientIds = [];

    for (const recipient of normalizedRecipients) {
      const actionPath = definition.buildActionPath(context, recipient.role);

      const [recipientResult] = await connection.query(
        `
          INSERT INTO notification_recipients
          (notification_id, user_id, external_name, external_email, action_path, created_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `,
        [
          notificationId,
          recipient.external ? null : recipient.userId,
          recipient.external ? recipient.name || null : null,
          recipient.external ? recipient.email : null,
          actionPath,
        ]
      );

      const recipientId = recipientResult.insertId;

      recipientIds.push(recipientId);

      // External recipients have no account to hold a preference
      // against -- they are always essential (no opt-out concept).
      const { eligible, skipReason } = recipient.external
        ? { eligible: true, skipReason: null }
        : await resolveEmailEligibility(connection, {
            userId: recipient.userId,
            category: definition.category,
            emailPolicy: definition.emailPolicy,
          });

      // next_attempt_at uses MySQL's own NOW() (via IF), not a JS
      // Date parameter: mysql2 rounds a Date's milliseconds to the
      // nearest second when serializing DATETIME, which can round
      // UP into the future and make the row invisible to
      // claimBatch's "next_attempt_at <= NOW()" check for up to ~1s.
      // Letting MySQL compute it server-side avoids the whole class
      // of driver-rounding-vs-NOW() mismatches.
      await connection.query(
        `
          INSERT INTO notification_deliveries
          (recipient_id, channel, destination_snapshot, status, next_attempt_at, skip_reason, created_at, updated_at)
          VALUES (?, 'email', ?, ?, IF(?, NOW(), NULL), ?, NOW(), NOW())
        `,
        [
          recipientId,
          recipient.email,
          eligible ? "pending" : "skipped",
          eligible ? 1 : 0,
          eligible ? null : skipReason,
        ]
      );
    }

    if (ownsTransaction) {
      await connection.commit();
    }

    return { notificationId, deduplicated: false, recipientIds };
  } catch (error) {
    if (ownsTransaction) {
      await connection.rollback();
    }
    // Not our transaction -- propagate and let the caller's own
    // catch/rollback undo the notification insert along with
    // whatever business change it was wrapping.
    throw error;
  } finally {
    if (ownsTransaction) {
      connection.release();
    }
  }
}

module.exports = {
  createServiceError,
  createNotificationEvent,
  EMAIL_POLICIES,
};

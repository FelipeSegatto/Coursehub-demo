const { listNotificationTypes } = require("./notificationTypeRegistry");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * A category is only toggleable if it has at least one non-essential
 * type -- essential email never respects the opt-out, so exposing a
 * toggle that does nothing would be misleading. defaultEnabled
 * reflects the registry's own default (default_on/default_off)
 * before any user override.
 */
function buildCategoryDefaults() {
  const byCategory = new Map();

  for (const definition of listNotificationTypes()) {
    if (definition.emailPolicy === "essential") {
      continue;
    }

    const existing = byCategory.get(definition.category);
    const defaultEnabled = definition.emailPolicy === "default_on";

    if (!existing) {
      byCategory.set(definition.category, { category: definition.category, defaultEnabled });
    } else if (existing.defaultEnabled !== defaultEnabled) {
      // Mixed policies in the same category: default to the safer
      // (opt-in) behavior rather than silently emailing by default.
      existing.defaultEnabled = false;
    }
  }

  return Array.from(byCategory.values());
}

async function listPreferences(db, { userId }) {
  const categories = buildCategoryDefaults();

  const [overrideRows] = await db.promise().query(
    `SELECT category, email_enabled FROM notification_preferences WHERE user_id = ?`,
    [userId]
  );

  const overridesByCategory = new Map(
    overrideRows.map((row) => [row.category, Boolean(row.email_enabled)])
  );

  return categories.map((entry) => ({
    category: entry.category,
    emailEnabled: overridesByCategory.has(entry.category)
      ? overridesByCategory.get(entry.category)
      : entry.defaultEnabled,
    isDefault: !overridesByCategory.has(entry.category),
  }));
}

async function updatePreference(db, { userId, category, emailEnabled }) {
  if (typeof category !== "string" || !category.trim()) {
    throw createServiceError("Categoria inválida.", 400);
  }

  if (typeof emailEnabled !== "boolean") {
    throw createServiceError("emailEnabled deve ser verdadeiro ou falso.", 400);
  }

  await db.promise().query(
    `
      INSERT INTO notification_preferences (user_id, category, email_enabled, updated_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE email_enabled = VALUES(email_enabled), updated_at = NOW()
    `,
    [userId, category.trim(), emailEnabled ? 1 : 0]
  );

  return { category: category.trim(), emailEnabled };
}

module.exports = {
  createServiceError,
  listPreferences,
  updatePreference,
};

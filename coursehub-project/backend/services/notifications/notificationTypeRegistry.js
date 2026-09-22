const EMAIL_POLICIES = ["essential", "default_on", "default_off"];
const PRIORITIES = ["normal", "high", "urgent"];

const registry = new Map();

function isFunction(value) {
  return typeof value === "function";
}

/**
 * Central declaration for a notification type. Nothing outside the
 * registry should decide title/message copy, action links, priority,
 * email policy, or the required-context contract -- routes/services
 * that emit an event only supply raw context + recipients and call
 * notificationService.createNotificationEvent(db, { type, ... }).
 *
 * recipientPolicy is descriptive metadata only in this stage (stage 1
 * has no domain resolvers yet -- callers pass pre-resolved
 * recipients directly). It documents WHO the type is meant to reach,
 * so stage 5's resolvers have a contract to implement against.
 *
 * sensitiveActionPath (optional, default false) declares that this
 * type's buildActionPath() MAY embed a one-time secret (e.g. a raw
 * checkout/invoice-payment token in the URL) for an EXTERNAL
 * recipient (no CourseHub account, no in-app inbox that would ever
 * need to re-read it). The email worker
 * (workers/notificationEmailWorker.js) nulls out
 * notification_recipients.action_path for such a recipient right
 * after a successful send, so the raw token does not linger at rest
 * in the outbox once delivered -- it is never re-derivable from
 * notification_recipients after that point; sharing the link again
 * always requires generating a brand new token. This never applies to
 * an internal recipient (user_id set) even on a type flagged true --
 * the worker only clears it when the recipient has no user_id, since
 * only internal recipients ever read action_path back via the in-app
 * inbox (notificationQueryService.js).
 */
function validateDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new Error("Notification type definition must be an object.");
  }

  const { type, category, priority, emailPolicy, requiredContext } = definition;

  if (typeof type !== "string" || !type.trim()) {
    throw new Error("Notification type definition requires a non-empty 'type'.");
  }

  if (typeof category !== "string" || !category.trim()) {
    throw new Error(`Notification type "${type}" requires a non-empty 'category'.`);
  }

  const priorityIsValid =
    (typeof priority === "string" && PRIORITIES.includes(priority)) || isFunction(priority);

  if (!priorityIsValid) {
    throw new Error(
      `Notification type "${type}" requires 'priority' to be one of ${PRIORITIES.join(
        ", "
      )} or a function(context) => priority.`
    );
  }

  if (!EMAIL_POLICIES.includes(emailPolicy)) {
    throw new Error(
      `Notification type "${type}" requires 'emailPolicy' to be one of ${EMAIL_POLICIES.join(
        ", "
      )}.`
    );
  }

  if (!Array.isArray(requiredContext)) {
    throw new Error(`Notification type "${type}" requires 'requiredContext' to be an array.`);
  }

  ["buildTitle", "buildMessage", "buildActionPath", "buildDeduplicationKey"].forEach((key) => {
    if (!isFunction(definition[key])) {
      throw new Error(`Notification type "${type}" requires '${key}' to be a function.`);
    }
  });

  if (definition.recipientPolicy !== undefined && typeof definition.recipientPolicy !== "string") {
    throw new Error(`Notification type "${type}": 'recipientPolicy', when present, must describe the resolver as a string.`);
  }

  if (
    definition.sensitiveActionPath !== undefined &&
    typeof definition.sensitiveActionPath !== "boolean"
  ) {
    throw new Error(
      `Notification type "${type}": 'sensitiveActionPath', when present, must be a boolean.`
    );
  }

  if (
    definition.actionLabel !== undefined &&
    (typeof definition.actionLabel !== "string" || !definition.actionLabel.trim())
  ) {
    throw new Error(
      `Notification type "${type}": 'actionLabel', when present, must be a non-empty string.`
    );
  }
}

function assertRequiredContext(definition, context) {
  const missing = definition.requiredContext.filter(
    (key) => context?.[key] === undefined || context?.[key] === null
  );

  if (missing.length > 0) {
    throw new Error(
      `Notification type "${definition.type}" is missing required context keys: ${missing.join(
        ", "
      )}.`
    );
  }
}

function registerNotificationType(definition) {
  validateDefinition(definition);

  if (registry.has(definition.type)) {
    throw new Error(`Notification type "${definition.type}" is already registered.`);
  }

  registry.set(definition.type, definition);

  return definition;
}

function getNotificationType(type) {
  const definition = registry.get(type);

  if (!definition) {
    throw new Error(`Unknown notification type "${type}". Register it first.`);
  }

  return definition;
}

function resolvePriority(definition, context) {
  return isFunction(definition.priority) ? definition.priority(context) : definition.priority;
}

function listNotificationTypes() {
  return Array.from(registry.values());
}

/** Test-only escape hatch -- production code never removes a registered type. */
function _unregisterNotificationType(type) {
  registry.delete(type);
}

module.exports = {
  EMAIL_POLICIES,
  PRIORITIES,
  registerNotificationType,
  getNotificationType,
  listNotificationTypes,
  assertRequiredContext,
  resolvePriority,
  _unregisterNotificationType,
};

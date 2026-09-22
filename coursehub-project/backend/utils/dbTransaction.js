const RETRYABLE_ERROR_CODES = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

/**
 * Runs `businessFn(connection)` inside a transaction, retrying on a
 * fresh connection if MySQL reports a deadlock or lock-wait timeout
 * -- InnoDB can genuinely deadlock two unrelated transactions that
 * both INSERT many rows into the same table's unique secondary
 * index concurrently (confirmed empirically: notification_deliveries
 * writes from two different activities, no logically-shared row,
 * still deadlocked under concurrent load). That's expected RDBMS
 * behavior under concurrency, not a bug -- the standard fix is
 * retrying the whole transaction from scratch, since MySQL already
 * rolled it back by the time the error surfaces.
 *
 * Any other error (validation, not-found, etc.) is rolled back once
 * and rethrown immediately, no retry.
 */
async function withTransaction(db, businessFn, { maxAttempts = 3 } = {}) {
  let attempt = 0;

  while (true) {
    attempt += 1;

    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      const result = await businessFn(connection);

      await connection.commit();

      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Erro ao desfazer transação:", rollbackError);
      }

      if (RETRYABLE_ERROR_CODES.has(error.code) && attempt < maxAttempts) {
        continue;
      }

      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = { withTransaction };

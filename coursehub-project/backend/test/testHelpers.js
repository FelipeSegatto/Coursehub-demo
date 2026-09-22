const RETRYABLE_ERROR_CODES = new Set(["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);

/**
 * Same retry-on-deadlock idea as utils/dbTransaction.js#withTransaction,
 * for test cleanup (after()) queries that aren't wrapped in a real
 * business transaction. With several notification test files now
 * running concurrently and all writing/deleting from the same real
 * tables, a plain cleanup DELETE can occasionally be picked as an
 * InnoDB deadlock victim too -- confirmed empirically (~1 in 6 full
 * suite runs). Retrying the single statement is enough here, there's
 * no multi-step transaction to restart.
 */
async function retryOnDeadlock(queryFn, { maxAttempts = 3 } = {}) {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await queryFn();
    } catch (error) {
      if (RETRYABLE_ERROR_CODES.has(error.code) && attempt < maxAttempts) {
        continue;
      }

      throw error;
    }
  }
}

module.exports = { retryOnDeadlock };

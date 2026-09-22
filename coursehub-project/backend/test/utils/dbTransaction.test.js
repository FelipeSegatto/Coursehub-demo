const { test } = require("node:test");
const assert = require("node:assert/strict");

const { withTransaction } = require("../../utils/dbTransaction");

function makeFakeDb() {
  const connections = [];

  const db = {
    promise: () => ({
      getConnection: async () => {
        const connection = {
          beginTransaction: async () => {},
          commit: async () => {},
          rollback: async () => {},
          release: () => {},
        };

        connections.push(connection);

        return connection;
      },
    }),
  };

  return { db, connections };
}

function deadlockError() {
  const error = new Error("Deadlock found when trying to get lock; try restarting transaction");
  error.code = "ER_LOCK_DEADLOCK";
  return error;
}

test("withTransaction commits and returns the business function's result on success", async () => {
  const { db } = makeFakeDb();

  const result = await withTransaction(db, async (connection) => {
    assert.ok(connection);
    return { ok: true };
  });

  assert.deepEqual(result, { ok: true });
});

test("withTransaction retries once on ER_LOCK_DEADLOCK and succeeds on the second attempt", async () => {
  const { db, connections } = makeFakeDb();

  let attempts = 0;

  const result = await withTransaction(db, async () => {
    attempts += 1;

    if (attempts === 1) {
      throw deadlockError();
    }

    return { attempts };
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { attempts: 2 });
  assert.equal(connections.length, 2, "a fresh connection is used per attempt");
});

test("withTransaction gives up after maxAttempts deadlocks and rethrows", async () => {
  const { db } = makeFakeDb();

  let attempts = 0;

  await assert.rejects(
    withTransaction(
      db,
      async () => {
        attempts += 1;
        throw deadlockError();
      },
      { maxAttempts: 3 }
    ),
    (error) => error.code === "ER_LOCK_DEADLOCK"
  );

  assert.equal(attempts, 3);
});

test("withTransaction does not retry a non-deadlock error", async () => {
  const { db } = makeFakeDb();

  let attempts = 0;

  await assert.rejects(
    withTransaction(db, async () => {
      attempts += 1;
      throw Object.assign(new Error("not found"), { statusCode: 404 });
    }),
    (error) => error.statusCode === 404
  );

  assert.equal(attempts, 1, "a non-retryable error must fail immediately, no retry");
});

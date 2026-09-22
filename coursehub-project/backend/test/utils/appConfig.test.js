const { test } = require("node:test");
const assert = require("node:assert/strict");

const { datesRepresentSameInstant } = require("../../utils/appConfig");

test("datesRepresentSameInstant: a bare date string equals itself, not shifted by UTC parsing", () => {
  // Regression test: comparing "2026-09-01" (parsed as UTC midnight
  // per the JS Date spec) against a mysql2 Date object for the same
  // column (local midnight, e.g. GMT-03:00) used to report "changed"
  // for an identical re-save. Simulated here with a real Date built
  // the way mysql2 builds it -- local-time constructor args.
  const dbValue = new Date(2026, 8, 1, 0, 0, 0); // month is 0-indexed: September 1st, local time

  assert.equal(datesRepresentSameInstant(dbValue, "2026-09-01"), true);
});

test("datesRepresentSameInstant: a genuinely different date is detected as changed", () => {
  const dbValue = new Date(2026, 8, 1, 0, 0, 0);

  assert.equal(datesRepresentSameInstant(dbValue, "2026-09-20"), false);
});

test("datesRepresentSameInstant: full datetime strings compare correctly", () => {
  const dbValue = new Date(2026, 8, 1, 23, 59, 0);

  assert.equal(datesRepresentSameInstant(dbValue, "2026-09-01 23:59:00"), true);
  assert.equal(datesRepresentSameInstant(dbValue, "2026-09-01 20:00:00"), false);
});

test("datesRepresentSameInstant: null on both sides is unchanged", () => {
  assert.equal(datesRepresentSameInstant(null, null), true);
});

test("datesRepresentSameInstant: null vs a real date is a change in either direction", () => {
  assert.equal(datesRepresentSameInstant(null, "2026-09-01"), false);
  assert.equal(datesRepresentSameInstant(new Date(2026, 8, 1), null), false);
});

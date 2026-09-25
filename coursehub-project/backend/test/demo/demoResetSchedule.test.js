const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const statePath = path.join(os.tmpdir(), `coursehub-demo-reset-${process.pid}.json`);
process.env.DEMO_RESET_ON_LOGOUT = "true";
process.env.DEMO_RESET_DELAY_MS = String(60 * 60 * 1000);
process.env.DEMO_RESET_STATE_PATH = statePath;

const { scheduleDemoResetAfterLogin } = require("../../services/demo/demoResetService");

after(() => {
  fs.rmSync(statePath, { force: true });
});

function readResetAt() {
  return Date.parse(JSON.parse(fs.readFileSync(statePath, "utf8")).resetAt);
}

test("cada login empurra o reset para uma hora depois do último token", () => {
  const firstAt = Date.parse("2026-09-24T12:00:00.000Z");
  const secondAt = Date.parse("2026-09-24T12:20:00.000Z");

  const first = scheduleDemoResetAfterLogin(firstAt);
  const second = scheduleDemoResetAfterLogin(secondAt);

  assert.equal(first.resetAt, "2026-09-24T13:00:00.000Z");
  assert.equal(second.resetAt, "2026-09-24T13:20:00.000Z");
  assert.equal(readResetAt(), Date.parse(second.resetAt));
});

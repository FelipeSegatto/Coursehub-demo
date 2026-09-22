const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildClassGroupKey } = require("../../services/chat/chatClassGroupService");

test("buildClassGroupKey is stable per class", () => {
  assert.equal(buildClassGroupKey(8), "class_group:8");
  assert.equal(buildClassGroupKey("8"), "class_group:8");
});

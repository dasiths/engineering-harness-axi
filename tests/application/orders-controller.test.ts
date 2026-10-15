import assert from "node:assert/strict";
import test from "node:test";
import { getOrder } from "../../src/api/orders-controller.ts";

test("known order returns its summary", () => {
  assert.deepEqual(getOrder("order-001"), { status: 200, body: { id: "order-001", total: 42 } });
});

test("unknown order returns a not-found response", () => {
  assert.deepEqual(getOrder("missing"), { status: 404, body: { error: "Order not found" } });
});

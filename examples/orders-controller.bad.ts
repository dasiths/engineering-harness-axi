import { findOrder } from "../persistence/orders-store.js";

export function getOrder(id: string) {
  const order = findOrder(id);
  return order ? { status: 200, body: order } : { status: 404, body: { error: "Order not found" } };
}

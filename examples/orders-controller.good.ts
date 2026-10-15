import { getOrderSummary } from "../application/orders-service.js";

export function getOrder(id: string) {
  const order = getOrderSummary(id);
  return order ? { status: 200, body: order } : { status: 404, body: { error: "Order not found" } };
}

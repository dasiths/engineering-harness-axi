import { findOrder } from "../persistence/orders-store.js";

export function getOrderSummary(id: string): { id: string; total: number } | undefined {
  const order = findOrder(id);
  return order ? { id: order.id, total: order.total } : undefined;
}

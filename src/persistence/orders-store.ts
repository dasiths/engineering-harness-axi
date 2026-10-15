export interface Order {
  id: string;
  total: number;
}

const orders: Order[] = [{ id: "order-001", total: 42 }];

export function findOrder(id: string): Order | undefined {
  return orders.find(order => order.id === id);
}

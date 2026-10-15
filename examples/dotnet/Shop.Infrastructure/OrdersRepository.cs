namespace Shop.Infrastructure;

public record Order(string Id, decimal Total);

public sealed class OrdersRepository
{
    public Order? Find(string id) => id == "order-001" ? new Order(id, 42m) : null;
}

using Shop.Infrastructure;

namespace Shop.Application;

public record OrderSummary(string Id, decimal Total);

public sealed class OrdersService(OrdersRepository repository)
{
    public OrderSummary? Get(string id)
    {
        var order = repository.Find(id);
        return order is null ? null : new OrderSummary(order.Id, order.Total);
    }
}

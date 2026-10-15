using Shop.Application;

namespace Shop.Api.Controllers.Admin;

public sealed class OrdersController(OrdersService service)
{
    public OrderSummary? Get(string id) => service.Get(id);
}

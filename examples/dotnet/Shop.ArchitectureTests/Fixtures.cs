namespace Shop.Api.Controllers.Fixtures
{
    public sealed class ValidController(Shop.Application.OrdersService service)
    {
        public Shop.Application.OrderSummary? Get(string id) => service.Get(id);
    }
}

namespace Shop.Api.Controllers.Fixtures.Nested
{
    public sealed class InvalidController(Shop.Infrastructure.OrdersRepository repository)
    {
        public Shop.Infrastructure.Order? Get(string id) => repository.Find(id);
    }
}

namespace Shop.Api.ControllersOther
{
    public sealed class ExcludedController(Shop.Infrastructure.OrdersRepository repository)
    {
        public Shop.Infrastructure.Order? Get(string id) => repository.Find(id);
    }
}

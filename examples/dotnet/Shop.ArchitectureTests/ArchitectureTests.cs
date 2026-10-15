using System.Reflection;
using NetArchTest.Rules;
using Xunit;

namespace Shop.ArchitectureTests;

public sealed class ArchitectureTests
{
    private const string Controllers = @"^Shop\.Api\.Controllers(\.|$)";

    private static PredicateList ControllerTypes(Assembly assembly) =>
        Types.InAssembly(assembly).That().ResideInNamespaceMatching(Controllers);

    [Fact]
    public void Controllers_must_not_depend_on_infrastructure()
    {
        var assembly = typeof(Shop.Api.Controllers.OrdersController).Assembly;
        Assert.NotEmpty(ControllerTypes(assembly).GetTypes());
        var result = ControllerTypes(assembly)
            .ShouldNot()
            .HaveDependencyOn("Shop.Infrastructure")
            .GetResult();

        Assert.True(result.IsSuccessful,
            "ARCH001: Controllers must use application services, not infrastructure. Offenders: " +
            string.Join(", ", result.FailingTypeNames ?? Enumerable.Empty<string>()));
    }

    [Fact]
    public void Rule_selects_nested_controllers_but_not_similarly_named_namespaces()
    {
        var selected = ControllerTypes(typeof(ArchitectureTests).Assembly)
            .GetTypes().Select(type => type.FullName).ToArray();
        Assert.Contains(typeof(Shop.Api.Controllers.Fixtures.ValidController).FullName, selected);
        Assert.Contains(typeof(Shop.Api.Controllers.Fixtures.Nested.InvalidController).FullName, selected);
        Assert.DoesNotContain(typeof(Shop.Api.ControllersOther.ExcludedController).FullName, selected);
    }

    [Fact]
    public void Rule_detects_the_known_violation_without_rejecting_valid_code()
    {
        var result = ControllerTypes(typeof(ArchitectureTests).Assembly)
            .ShouldNot().HaveDependencyOn("Shop.Infrastructure").GetResult();
        Assert.False(result.IsSuccessful);
        Assert.Equal(
            new[] { typeof(Shop.Api.Controllers.Fixtures.Nested.InvalidController).FullName },
            result.FailingTypeNames.Order());
    }
}

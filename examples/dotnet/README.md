---
title: NetArchTest Architecture Sensor
description: "An optional .NET companion that turns a controller dependency test into actionable agent feedback."
---

## The expectation

Controllers in `Shop.Api.Controllers` and its child namespaces use
`Shop.Application` services instead of referencing `Shop.Infrastructure`
directly. This follows the scenario in
[Dasith's sensor-refinement blog post](https://dasith.me/2026/06/20/refining-inferential-sensors/).

```text
Shop.Api -> Shop.Application -> Shop.Infrastructure
```

These are small class libraries and tests, not a hosted API. The persistence
implementation is in memory. The sample demonstrates dependency detection;
it does not claim that a dependency rule proves the architecture is correct.

## Prerequisites

* Complete the root repository's `npm ci` setup.
* Install the .NET 10 SDK and put `dotnet` on PATH.
* Allow NuGet access on first restore, or prepopulate the package cache.

The original `NetArchTest.Rules` 1.3.2 package is deliberately pinned to keep
the example close to the blog's API. It is an older package; evaluate
[the enhanced edition](https://github.com/NeVeSpl/NetArchTest.eNhancedEdition)
or alternatives before adopting a long-term production dependency. The
example does not silently switch APIs or claim the original package is
actively maintained.

NuGet lock files are committed. Sensor builds use locked restore; package
updates require an explicit reviewed refresh. Build and test output stays
under the repository's ignored `.harness/state` directory.

## Run through the harness

From the repository root:

```bash
./harness sensors explain architecture-dotnet
./harness sensors run architecture-dotnet
```

The sensor first performs a fresh Release build. It then runs the tests with
`--no-build --no-restore` against that build and requests a TRX report in a
new output directory. It accepts only complete, consistent results with
the expected controller rule present. Skipped tests, zero tests, missing
reports and setup failures cannot produce green evidence.

The three tests check:

1. The actual API controllers do not depend on infrastructure.
2. The selector includes nested controller namespaces but excludes similarly
   named namespaces, with non-empty scope.
3. A known violating fixture is detected and a valid fixture is not rejected.

The rule uses `ResideInNamespaceMatching` with a namespace boundary, extending
the blog's short example to make nested-scope behaviour explicit.

## Introduce a real violation, then repair it

From the repository root:

```bash
cp examples/dotnet/variants/OrdersController.bad.cs.txt \
  examples/dotnet/Shop.Api/Controllers/OrdersController.cs
./harness sensors run architecture-dotnet
```

The project still compiles. The architecture test now fails with `ARCH001`
and `Shop.Api.Controllers.OrdersController` in its offender list.
The sensor returns exit `1`, `status: fail`, and the application-service
repair route.

```bash
cp examples/dotnet/variants/OrdersController.good.cs.txt \
  examples/dotnet/Shop.Api/Controllers/OrdersController.cs
./harness sensors run architecture-dotnet
```

This rebuilds and rechecks the repaired code. It does not reuse the earlier
assembly or test result.

## Run and test without the adapter

From this directory:

```bash
dotnet test Shop.ArchitectureTests/Shop.ArchitectureTests.csproj \
  --configuration Release -p:RestoreLockedMode=true
```

From the repository root, run the adapter's integration tests:

```bash
npm run test:dotnet
```

They use temporary repository copies to exercise passing code, actual and
nested violations, recovery, and broken compilation. The .NET tests are
separate from `npm test`, so the default Node workflow requires no SDK.

## From a sensor to a gate

The sensor is discoverable but not in the default required-sensor list.
In a .NET project, add `architecture-dotnet` to
[the acceptance policy](../../.harness/config.json) through review.
The separate `dotnet-example` CI job validates this companion; configure
it as required if it should gate your repository.

NetArchTest inspects compiled dependencies. It cannot detect every semantic
responsibility mistake, runtime dependency, or persistence assumption encoded
only in naming. Keep human review for those judgments.

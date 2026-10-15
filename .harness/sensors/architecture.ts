import ts from "typescript";
import { defineSensor, type Observation } from "../lib/contracts.ts";
import { portablePath } from "../lib/files.ts";
import { loadProject } from "../lib/project.ts";

export default defineSensor({
  description: "Detect direct controller dependencies on persistence using resolved TypeScript modules",
  scope: "All src/api/**/*.ts imports and re-exports in src/tsconfig.json",
  rules: [{
    id: "ARCH001",
    expectation: "Controllers use application-layer services, not persistence modules",
    reason: "Keep request handling testable without persistence setup",
    repair: "Move the persistence operation behind an application service; do not suppress the rule",
    example: "src/application/orders-service.ts"
  }],
  async run({ root }) {
    const program = loadProject(root);
    const checker = program.getTypeChecker();
    const files = program.getSourceFiles().filter(file => {
      const path = portablePath(root, file.fileName);
      return path.startsWith("src/api/") && !file.isDeclarationFile;
    });
    if (!files.length) throw new Error("No API modules were checked; verify src/tsconfig.json and src/api");
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length) throw new Error("Architecture evidence is incomplete because the source project does not type-check; run ./harness sensors run typecheck");
    const findings: Observation["findings"] = [];
    for (const file of files) {
      const seen = new Set<string>();
      const inspect = (specifier: ts.StringLiteralLike, symbol?: ts.Symbol): void => {
        const resolved = ts.resolveModuleName(specifier.text, file.fileName, program.getCompilerOptions(), ts.sys).resolvedModule;
        if (!resolved) throw new Error(`Cannot resolve dependency ${specifier.text} in ${portablePath(root, file.fileName)}`);
        const declarations = symbol && (symbol.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol).declarations ?? [] : [];
        const exportedPaths: string[] = [];
        const moduleSymbol = checker.getSymbolAtLocation(specifier);
        if (moduleSymbol) {
          for (const exported of checker.getExportsOfModule(moduleSymbol)) {
            const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
            exportedPaths.push(...(target.declarations ?? []).map(declaration => declaration.getSourceFile().fileName));
          }
        }
        const paths = [resolved.resolvedFileName, ...declarations.map(d => d.getSourceFile().fileName), ...exportedPaths];
        const persistence = paths.find(path => portablePath(root, path).startsWith("src/persistence/"));
        if (!persistence) return;
        const location = `${portablePath(root, file.fileName)}:${file.getLineAndCharacterOfPosition(specifier.getStart(file)).line + 1}`;
        const key = `${location}:${persistence}`;
        if (seen.has(key)) return;
        seen.add(key);
        findings.push({
          rule: "ARCH001", location,
          message: `API module depends on ${portablePath(root, persistence)}`,
          guidance: "Use an application-layer service, as in src/application/orders-service.ts. This keeps API tests independent of persistence."
        });
      };
      const visit = (node: ts.Node): void => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
          inspect(node.moduleSpecifier);
          if (ts.isImportDeclaration(node)) {
            const clause = node.importClause;
            const names = [
              ...(clause?.name ? [clause.name] : []),
              ...(clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.map(element => element.name) : [])
            ];
            for (const name of names) inspect(node.moduleSpecifier, checker.getSymbolAtLocation(name));
          }
        }
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
          const specifier = node.arguments[0];
          if (!specifier || !ts.isStringLiteralLike(specifier)) throw new Error("Computed module loading is outside this sensor's supported scope");
          inspect(specifier);
        }
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
          const specifier = node.moduleReference.expression;
          if (!specifier || !ts.isStringLiteralLike(specifier)) throw new Error("Unsupported import assignment");
          inspect(specifier);
        }
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
          inspect(node.argument.literal);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    return { checked: files.length, findings };
  }
});

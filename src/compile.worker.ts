import ts from 'typescript';

self.onmessage = (event: MessageEvent<{ source: string }>) => {
  const source = event.data.source;
  try {
    if (source.length > 65536) throw new Error('Code exceeds the 64 KB limit.');
    const file = ts.createSourceFile('solution.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    let blocked = false;
    function inspect(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node) || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) blocked = true;
      ts.forEachChild(node, inspect);
    }
    inspect(file);
    if (blocked) throw new Error('Imports are unavailable in this exercise. Use the supplied function signature.');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, strict: true, isolatedModules: true },
      fileName: 'solution.ts',
      reportDiagnostics: true,
    });
    const errors = compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
    self.postMessage({ code: compiled.outputText });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

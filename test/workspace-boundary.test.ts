import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const workspaceDir = path.resolve('src/workspace');
const DOM_GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage']);

async function workspaceSourcePaths(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return workspaceSourcePaths(entryPath);
    return /\.(?:[cm]?ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  }));
  return paths.flat();
}

function moduleSpecifier(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments.length === 1
    && ts.isStringLiteral(node.arguments[0]!)
  ) {
    return node.arguments[0]!.text;
  }
  return undefined;
}

function isForbiddenModule(specifier: string): boolean {
  return specifier === 'react'
    || specifier.startsWith('react/')
    || specifier === 'react-dom'
    || specifier.startsWith('react-dom/')
    || /(?:^|\/)persistence(?:\/|$)/.test(specifier);
}

function inspectBoundary(filePath: string, source: string): void {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);

  function visit(node: ts.Node): void {
    const specifier = moduleSpecifier(node);
    if (specifier !== undefined) {
      assert.equal(isForbiddenModule(specifier), false, filePath + ': forbidden import ' + specifier);
    }

    if (ts.isIdentifier(node) && DOM_GLOBALS.has(node.text)) {
      assert.fail(filePath + ': forbidden DOM/storage global ' + node.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

test('workspace pure state layer does not depend on React, DOM or persistence', async () => {
  const paths = await workspaceSourcePaths(workspaceDir);
  assert.ok(paths.length > 0, 'workspace source files must be discovered');

  for (const filePath of paths) {
    inspectBoundary(filePath, await readFile(filePath, 'utf8'));
  }
});

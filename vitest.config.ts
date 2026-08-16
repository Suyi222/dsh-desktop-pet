/**
 * Vitest configuration. The plugin's test suite exercises the same source the
 * official harness packages ship, so `@deepseek-ai/*` imports are aliased to
 * the enclosing DeepSeek Harness checkout's source tree (the built npm
 * artifacts are browser module-loader bundles and cannot execute under Node,
 * and the published npm packages are currently incomplete). This makes the
 * tests a development-time tool: run them from inside a harness checkout.
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

/**
 * Transform standard TypeScript decorators before Vite's default parser sees
 * source files (mirrors the harness's shared vitest plugin).
 */
function standardDecoratorPlugin() {
  return {
    name: 'dsh-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0]!
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)))

/** Walk up from the repo to the enclosing DeepSeek Harness checkout. */
function harnessRoot(start: string): string {
  let current = start
  while (!existsSync(join(current, 'vendor', 'cordis', 'src', 'index.ts'))) {
    const parent = dirname(current)
    if (parent === current) throw new Error('vitest: run tests from inside a DeepSeek Harness checkout')
    current = parent
  }
  return current
}

const harness = harnessRoot(repoRoot)

/** Map the harness packages our test chain imports at runtime to their source. */
const alias: Record<string, string> = {
  '@deepseek-ai/cordis': join(harness, 'vendor', 'cordis', 'src', 'index.ts'),
  '@deepseek-ai/cosmokit': join(harness, 'vendor', 'cosmokit', 'src', 'index.ts'),
  '@deepseek-ai/schemastery': join(harness, 'vendor', 'schemastery', 'src', 'index.ts'),
  '@deepseek-ai/dsh-client-locale/client': join(harness, 'packages', 'client', 'locale', 'src', 'client', 'index.ts'),
  '@deepseek-ai/dsh-client-runtime/client': join(harness, 'packages', 'client', 'runtime', 'src', 'client', 'index.ts'),
  '@deepseek-ai/dsh-client-test-runtime': join(harness, 'packages', 'test-support', 'client-runtime', 'src', 'index.ts'),
  '@deepseek-ai/dsh-client-ui-slots': join(harness, 'packages', 'client', 'ui-slots', 'src', 'index.ts'),
  '@deepseek-ai/dsh-invariants': join(harness, 'packages', 'runtime-diagnostics', 'invariants', 'src', 'index.ts'),
  '@deepseek-ai/dsh-session/surface': join(harness, 'packages', 'core', 'session', 'src', 'surface.ts'),
  '@deepseek-ai/dsh-session/types': join(harness, 'packages', 'core', 'session', 'src', 'types.ts'),
  '@deepseek-ai/dsh-session': join(harness, 'packages', 'core', 'session', 'src', 'index.ts'),
  '@deepseek-ai/dsh-typert-protocol': join(harness, 'packages', 'typert', 'protocol', 'src', 'index.ts'),
  '@deepseek-ai/dsh-credentials': join(harness, 'packages', 'credentials', 'credentials', 'src', 'index.ts'),
}

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: { alias },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})

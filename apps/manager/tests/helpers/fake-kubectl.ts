import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Kubectl } from '../../src/kube/kubectl.js'

type Result = { stdout: string; stderr?: string; code?: number }
export interface Rule {
  match: (args: string[]) => boolean
  result: Result | ((args: string[]) => Result)
}

/** Kubectl test double: first matching rule answers, unmatched calls throw. `.calls` records every args array. */
export function fakeKubectl(rules: Rule[]): Kubectl & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async run(args) {
      calls.push(args)
      const rule = rules.find((r) => r.match(args))
      if (!rule) throw new Error(`fake kubectl: no rule for ${JSON.stringify(args)}`)
      const r = typeof rule.result === 'function' ? rule.result(args) : rule.result
      return { stdout: r.stdout, stderr: r.stderr ?? '', code: r.code ?? 0 }
    },
    spawn() {
      throw new Error('fake kubectl: spawn is not supported')
    },
  }
}

/** Raw text of `tests/fixtures/<name>.json`, usable as kubectl stdout. */
export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url)), 'utf8')
}

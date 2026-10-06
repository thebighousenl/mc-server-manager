import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import type { Kubectl } from '../../src/kube/kubectl.js'

export interface FakeResult { stdout: string, stderr?: string, code?: number }
export interface FakeRule { match: (args: string[]) => boolean, result: FakeResult | ((args: string[]) => FakeResult) }
export interface FakeChild extends ChildProcess { killed: boolean }

export function fakeKubectl(rules: FakeRule[]) {
  const calls: string[][] = []
  const children: FakeChild[] = []
  const find = (args: string[]) => {
    calls.push(args)
    const rule = rules.find(r => r.match(args))
    if (!rule) throw new Error(`fake kubectl: no rule for ${args.join(' ')}`)
    return typeof rule.result === 'function' ? rule.result(args) : rule.result
  }
  const kubectl: Kubectl & { calls: string[][], children: FakeChild[] } = {
    calls,
    children,
    async run(args) {
      const r = find(args)
      return { stdout: r.stdout, stderr: r.stderr ?? '', code: r.code ?? 0 }
    },
    spawn(args) {
      const r = find(args)
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        killed: false,
        kill() {
          child.killed = true
          return true
        },
      }) as unknown as FakeChild
      child.stdout!.end(r.stdout)
      children.push(child)
      return child
    },
  }
  return kubectl
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fixture = (name: string): any => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))

import type { Kubectl } from '../kube/kubectl.js'
import { names } from '../kube/objects.js'
import { logAction } from './action-log.js'
import { getServer } from './list.js'
import { validateCommand } from './validate.js'

export class ConsoleError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface ConsoleDeps {
  kubectl: Kubectl
  logger: { info: (obj: object, msg?: string) => void }
  timeoutMs?: number // SC-006: answer within 2 s
  pollMs?: number
  settleMs?: number // extra wait after the first answer so a multi-line reply is complete
}
export interface ConsoleResult { command: string, lines: string[], truncated: boolean }
export interface Players { online: number, max: number, players: string[] }

const MAX_LINES = 100
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const strip = (line: string) => line.replace(/^\[[^\]]*\]\s?/, '')

async function exec(deps: ConsoleDeps, name: string, command: string, done: (lines: string[]) => boolean): Promise<ConsoleResult> {
  const { kubectl, timeoutMs = 2000, pollMs = 200, settleMs = 150 } = deps
  const server = await getServer(kubectl, name)
  if (!server) throw new ConsoleError(404, 'unknown server')
  if (server.state !== 'running') throw new ConsoleError(422, 'server not ready')
  // The kubelet's clock may differ from ours, so start a little early rather than miss the reply.
  const since = new Date(Date.now() - 1000).toISOString()
  const read = async () => (await kubectl.run(['logs', `deploy/${names(name).deployment}`, `--since-time=${since}`])).stdout.split('\n').filter(l => l.trim())
  // The log only grows, so what is there before the command is sent is never its answer, look-back window included.
  const before = (await read()).length
  // Each word is its own argument: no shell is involved anywhere.
  await kubectl.run(['exec', `deploy/${names(name).deployment}`, '--', 'send-command', ...command.split(/\s+/)])
  const deadline = Date.now() + timeoutMs
  const fresh = async () => (await read()).slice(before)
  const result = (lines: string[]) => ({ command, lines: lines.slice(0, MAX_LINES), truncated: lines.length > MAX_LINES })
  for (;;) {
    let lines = await fresh()
    if (done(lines)) {
      await sleep(settleMs)
      lines = await fresh()
      return result(lines)
    }
    if (Date.now() >= deadline) return result(lines)
    await sleep(pollMs)
  }
}

export async function sendCommand(deps: ConsoleDeps, name: string, command: unknown, o: { operator: string }): Promise<ConsoleResult> {
  const v = validateCommand(command)
  if (!v.ok) throw new ConsoleError(400, v.message)
  const log = (outcome: string) => logAction(deps.logger, { operator: o.operator, server: name, action: 'command', outcome, detail: v.value.slice(0, 100) })
  try {
    const res = await exec(deps, name, v.value, lines => lines.length > 0)
    log('ok')
    return res
  }
  catch (err) {
    log('failed')
    throw err
  }
}

const HEADER = /There are (\d+)\/(\d+) players online:/

export async function getPlayers(deps: ConsoleDeps, name: string): Promise<Players> {
  const header = (lines: string[]) => lines.findIndex(l => HEADER.test(l))
  // The name line follows the header, so wait for it unless nobody is online.
  const { lines } = await exec(deps, name, 'list', (ls) => {
    const i = header(ls)
    return i >= 0 && (HEADER.exec(ls[i]!)![1] === '0' || ls.length > i + 1)
  })
  const i = header(lines)
  if (i < 0) throw new ConsoleError(502, 'the server did not answer the list command')
  const [, online, max] = HEADER.exec(lines[i]!)!
  return { online: +online!, max: +max!, players: strip(lines[i + 1] ?? '').split(',').map(p => p.trim()).filter(Boolean) }
}

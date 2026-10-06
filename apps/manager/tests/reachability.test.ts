import { createSocket, type Socket } from 'node:dgram'
import { afterEach, describe, expect, it } from 'vitest'
import { pingServer } from '../src/servers/reachability.js'

const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex')
let responder: Socket | undefined
afterEach(() => { responder?.close(); responder = undefined })

function start(reply: (msg: Buffer) => Buffer | null): Promise<number> {
  responder = createSocket('udp4')
  responder.on('message', (msg, rinfo) => {
    const out = reply(msg)
    if (out) responder!.send(out, rinfo.port, rinfo.address)
  })
  return new Promise(resolve => responder!.bind(0, '127.0.0.1', () => resolve((responder!.address() as { port: number }).port)))
}

const pong = (msg: Buffer) => {
  const motd = Buffer.from('MCPE;test;1;1;0;10;1;w;Survival')
  const len = Buffer.alloc(2)
  len.writeUInt16BE(motd.length)
  return Buffer.concat([Buffer.from([0x1c]), msg.subarray(1, 9), Buffer.alloc(8), MAGIC, len, motd])
}

describe('pingServer', () => {
  it('sends an unconnected ping and is true on an unconnected pong', async () => {
    let seen: Buffer | undefined
    const port = await start((m) => { seen = m; return pong(m) })
    expect(await pingServer('127.0.0.1', port)).toBe(true)
    expect(seen![0]).toBe(0x01)
    expect(seen!.subarray(9, 25)).toEqual(MAGIC)
  })

  it('is false after the timeout when nothing answers', async () => {
    const port = await start(() => null)
    const t = Date.now()
    expect(await pingServer('127.0.0.1', port, 200)).toBe(false)
    expect(Date.now() - t).toBeGreaterThanOrEqual(190)
  })

  it('is false, without throwing, for a malformed reply', async () => {
    const port = await start(() => Buffer.from([0xff, 0x00]))
    expect(await pingServer('127.0.0.1', port)).toBe(false)
  })
})

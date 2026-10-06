import { randomBytes } from 'node:crypto'
import { createSocket } from 'node:dgram'

const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex')

// RakNet unconnected ping (as scripts/raknet-ping.py). True only for an unconnected pong; never throws.
export function pingServer(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createSocket('udp4')
    const done = (ok: boolean) => {
      clearTimeout(timer)
      sock.close()
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    sock.on('error', () => done(false))
    sock.on('message', msg => done(msg.length >= 35 && msg[0] === 0x1c))
    const time = Buffer.alloc(8)
    time.writeBigUInt64BE(BigInt(Date.now()))
    sock.send(Buffer.concat([Buffer.from([0x01]), time, MAGIC, randomBytes(8)]), port, host, (err) => { if (err) done(false) })
  })
}

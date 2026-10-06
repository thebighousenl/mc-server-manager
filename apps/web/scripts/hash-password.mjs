import { hashPassword } from '../server/utils/password.ts'

// Prefer stdin so the password stays out of shell history and `ps`; argv is accepted as a fallback.
let password = process.argv[2]
if (!password && !process.stdin.isTTY) {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  password = input.replace(/\r?\n$/, '')
}
if (!password) {
  console.error('usage: printf %s "<password>" | pnpm --filter web hash-password')
  process.exit(1)
}
console.log(await hashPassword(password))

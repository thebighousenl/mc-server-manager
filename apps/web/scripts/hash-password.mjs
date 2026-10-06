import { hashPassword } from '../server/utils/password.ts'

const password = process.argv[2]
if (!password) {
  console.error('usage: pnpm --filter web hash-password <password>')
  process.exit(1)
}
console.log(await hashPassword(password))

import { getManagerStatus } from '../utils/manager'

export default defineEventHandler(async () => ({ status: await getManagerStatus() }))

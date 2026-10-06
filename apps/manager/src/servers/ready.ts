export const serverStarted = (logText: string): boolean => logText.includes('Server started.')

// A pod UID that has been seen started stays started: the line may later scroll out of the log tail.
export function createStartedTracker() {
  const started = new Set<string>()
  return {
    has: (uid: string) => started.has(uid),
    check(uid: string, logText: string) {
      if (serverStarted(logText)) started.add(uid)
      return started.has(uid)
    },
  }
}
export type StartedTracker = ReturnType<typeof createStartedTracker>
export const startedTracker = createStartedTracker()

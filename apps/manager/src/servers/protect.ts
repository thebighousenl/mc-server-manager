import { LABEL_PROTECTED } from '../kube/objects.js'

export const PROTECTED_NAMES: readonly string[] = Object.freeze(['gaitie', 'daan', 'kontgat', 'creative', 'plaskutje'])

export const isProtected = (name: string, labels: Record<string, string> = {}) =>
  PROTECTED_NAMES.includes(name) || labels[LABEL_PROTECTED] === 'true'

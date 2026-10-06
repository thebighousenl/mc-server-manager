import { describe, expect, it } from 'vitest'
import { INSTANCE_LABEL, MANAGED_LABEL, NAME_LABEL, PROTECTED_LABEL, SERVER_LABEL, managerLabels, names, selectorForServer } from '../src/kube/objects.js'

describe('objects', () => {
  it('names', () => {
    expect(names('daan')).toEqual({
      deployment: 'bedrock-daan', service: 'bedrock-daan', route: 'bedrock-daan', pvc: 'bedrock-data-daan', entrypoint: 'mc-daan',
    })
  })

  it('label constants', () => {
    expect([MANAGED_LABEL, SERVER_LABEL, PROTECTED_LABEL]).toEqual(['mc-manager/managed', 'mc-manager/server', 'mc-manager/protected'])
    expect([NAME_LABEL, INSTANCE_LABEL]).toEqual(['app.kubernetes.io/name', 'app.kubernetes.io/instance'])
  })

  it('managerLabels returns only mc-manager labels', () => {
    expect(managerLabels('daan', { protected: false })).toEqual({ 'mc-manager/managed': 'true', 'mc-manager/server': 'daan' })
    expect(managerLabels('daan', { protected: true })).toEqual({
      'mc-manager/managed': 'true', 'mc-manager/server': 'daan', 'mc-manager/protected': 'true',
    })
  })

  it('selectorForServer', () => {
    expect(selectorForServer('daan')).toBe('app.kubernetes.io/instance=daan,app.kubernetes.io/name=bedrock')
  })
})

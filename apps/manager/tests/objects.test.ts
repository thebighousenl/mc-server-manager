import { describe, expect, it } from 'vitest'
import {
  LABEL_INSTANCE,
  LABEL_MANAGED,
  LABEL_NAME,
  LABEL_PROTECTED,
  LABEL_SERVER,
  managerLabels,
  names,
  selectorForServer,
} from '../src/kube/objects.js'

describe('names', () => {
  it('derives every object name from the server name', () => {
    expect(names('daan')).toEqual({
      deployment: 'bedrock-daan',
      service: 'bedrock-daan',
      route: 'bedrock-daan',
      pvc: 'bedrock-data-daan',
      entrypoint: 'mc-daan',
    })
  })
})

describe('label keys', () => {
  it('are the documented ones', () => {
    expect(LABEL_MANAGED).toBe('mc-manager/managed')
    expect(LABEL_SERVER).toBe('mc-manager/server')
    expect(LABEL_PROTECTED).toBe('mc-manager/protected')
    expect(LABEL_NAME).toBe('app.kubernetes.io/name')
    expect(LABEL_INSTANCE).toBe('app.kubernetes.io/instance')
  })
})

describe('managerLabels', () => {
  it('sets managed and server only when not protected', () => {
    expect(managerLabels('zz-test', { protected: false })).toEqual({
      'mc-manager/managed': 'true',
      'mc-manager/server': 'zz-test',
    })
  })

  it('adds protected when protected', () => {
    expect(managerLabels('daan', { protected: true })).toEqual({
      'mc-manager/managed': 'true',
      'mc-manager/server': 'daan',
      'mc-manager/protected': 'true',
    })
  })
})

describe('selectorForServer', () => {
  it('selects by instance and app name', () => {
    expect(selectorForServer('daan')).toBe('app.kubernetes.io/instance=daan,app.kubernetes.io/name=bedrock')
  })
})

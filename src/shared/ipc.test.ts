import { describe, expect, it } from 'vitest'
import { ipcChannels } from './channels'
import { ipcContract } from './ipc'

describe('contrato IPC', () => {
  it('cada canal permitido tiene esquema y viceversa', () => {
    expect(Object.keys(ipcContract).sort()).toEqual([...ipcChannels].sort())
  })

  it('rechaza payloads inválidos', () => {
    expect(ipcContract['app:ping'].request.safeParse({ message: 123 }).success).toBe(false)
    expect(ipcContract['app:ping'].request.safeParse({ message: 'x'.repeat(201) }).success).toBe(
      false
    )
    expect(ipcContract['app:ping'].request.safeParse({ message: 'ok' }).success).toBe(true)
  })
})

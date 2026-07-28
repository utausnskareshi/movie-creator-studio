import type { McsApi } from '@shared/types'

declare global {
  interface Window {
    mcs: McsApi
  }
}

export {}

import { ElectronAPI } from '@electron-toolkit/preload'

export interface ICustomAPI {
  requestAppClose: () => void
  
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ICustomAPI
  }
}

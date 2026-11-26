import { ipcMain } from 'electron'
import { Languages } from '@/types'

export default function databaseHandler(db: any) {  
  ipcMain.handle('settings::updateLaguage', (_e, language: Languages) => {
    return db.updateLanguage(language)
  })
}

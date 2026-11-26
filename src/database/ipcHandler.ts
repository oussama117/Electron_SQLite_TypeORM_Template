import { ipcMain } from 'electron'
import AppDatabase from './AppDatabase'
import { Languages } from '@/types'

export default function databaseHandler(db: AppDatabase) {  
  ipcMain.handle('settings::updateLaguage', (_e, language: Languages) => {
    return db.updateLanguage(language)
  })
}

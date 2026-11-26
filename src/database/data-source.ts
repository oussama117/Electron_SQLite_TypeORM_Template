import 'reflect-metadata'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { DataSource } from 'typeorm'
import { entities } from './entities'

let dataSourceInstance: DataSource | null = null

function getDatabasePath(): string {
  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  return path.join(userDataPath, 'app.sqlite')
}

export function getDataSource(): DataSource {
  if (!dataSourceInstance) {
    dataSourceInstance = new DataSource({
      type: 'better-sqlite3',
      database: getDatabasePath(),
      entities,
      migrations: [],
      // Set true for quick local schema iteration; prefer migrations for versioned changes
      synchronize: !app.isPackaged,
      logging: !app.isPackaged ? ['error', 'warn'] : ['error'],
      enableWAL: true,
      prepareDatabase: (db) => {
        db.pragma('foreign_keys = ON')
      }
    })
  }
  return dataSourceInstance
}

export async function initializeDatabase(): Promise<DataSource> {
  const ds = getDataSource()
  if (!ds.isInitialized) {
    await ds.initialize()
  }
  return ds
}

export async function closeDatabase(): Promise<void> {
  if (dataSourceInstance?.isInitialized) {
    await dataSourceInstance.destroy()
  }
}
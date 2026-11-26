import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { __SCHEMA } from './schema/schema'
import {
  TrialJoinCandidate,
  TrialRow,
  CandidateRow,
  ReturnCandidateDTO,
  AppSettings,
  Languages,
  ErrorObject,
} from '@/types'

class AppDatabase {
  private db: Database.Database

  constructor() {
    // Persistent storage path
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'crimping_db.sqlite')

    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    // Open connection (Synchronous)
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    console.log('Database connected at:', dbPath)

    this.init()
  }

  private init(): void {
    try {
      // .exec handles the entire multi-line schema (Table + Trigger)
      this.db.exec(__SCHEMA)
      console.log('Trial table and triggers initialized.')
    } catch (err) {
      console.error('Schema initialization failed:', err)
    }
  }

  public getAllTrialJoinCandidate(): TrialJoinCandidate[] {
    try {
      const sql = `
      SELECT 
        t.id as t_id, 
        t.candidate_id as t_candidate_id, 
        t.crimped_t, t.failed_t, t.remaining_time, t.result, t.level, t.class, 
        t.created_at as t_created, t.updated_at as t_updated,
        c.id as c_id, c.candidate_name, c.serial_number, 
        c.created_at as c_created, c.updated_at as c_updated
      FROM trial t
      LEFT JOIN candidate c ON t.candidate_id = c.id
      ORDER BY t.created_at DESC
    `

      const stmt = this.db.prepare(sql)

      // We cast to 'any' initially because the SQL result is a flat object,
      // not the nested TrialJoinCandidate interface yet.
      const rows = stmt.all() as any[]

      return rows.map((row) => ({
        id: row.t_id,
        candidateId: row.t_candidate_id, // Fix: Use candidate_id, not t_id
        crimped_t: row.crimped_t,
        failed_t: row.failed_t,
        remaining_time: row.remaining_time,
        result: row.result,
        level: row.level,
        class: row.class,
        created_at: row.t_created,
        updated_at: row.t_updated,
        candidate: row.c_id
          ? {
              id: row.c_id,
              candidate_name: row.candidate_name,
              // Ensure serial_number matches your interface (number | null)
              serial_number: row.serial_number ? Number(row.serial_number) : null,
              created_at: row.c_created,
              updated_at: row.c_updated
            }
          : null
      }))
    } catch (error) {
      console.error('SQL Error in getAllTrialJoinCandidate:', error)
      return []
    }
  }

  public getCandidateBySerial(serial_number: string): ReturnCandidateDTO {
    try {
      const stmt = this.db.prepare('SELECT * FROM candidate WHERE serial_number = ?')
      const result = stmt.get(serial_number) as CandidateRow | undefined

      if (result) {
        return {
          exists: true,
          id: result.id,
          candidate_name: result.candidate_name,
          serial_number: result.serial_number as number,
          error: null
        }
      }

      return {
        exists: true,
        id: null,
        candidate_name: null,
        serial_number: null,
        error: null
      }
    } catch (err) {
      return {
        exists: false,
        id: null,
        candidate_name: null,
        serial_number: null,
        error: err
      }
    }
  }

  public createOrGetCandidate(candidate_name: string, serial_number: number): CandidateRow {
    const serialStr = serial_number.toString()

    // 1. Check for existing candidate
    const checkResult = this.getCandidateBySerial(serialStr)

    if (checkResult.error) {
      throw new Error('Database error during check: ' + checkResult.error)
    }

    // 2. If exists, fetch and return the full row
    if (checkResult.exists && checkResult.id) {
      return {
        id: checkResult.id,
        candidate_name: checkResult.candidate_name,
        serial_number: checkResult.serial_number
      } as CandidateRow
    }

    // 3. If doesn't exist, create it using RETURNING *
    try {
      const createStmt = this.db.prepare(`
      INSERT INTO candidate (candidate_name, serial_number)
      VALUES (?, ?)
      RETURNING *
    `)

      const newCandidate = createStmt.get(candidate_name, serialStr) as CandidateRow | undefined

      if (!newCandidate) {
        throw new Error('Failed to create candidate: No data returned')
      }

      const trialStmt = this.db.prepare(`
      INSERT INTO trial ( candidate_id, crimped_t, failed_t, remaining_time, result, level, class )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `)
      const newTrial = trialStmt.get(newCandidate.id, 0, 0, 0, 'init', 'level_init', 'class_init')
      if (!newTrial) {
        throw new Error('Failed to create trial: No data returned')
      }
      return newCandidate
    } catch (err) {
      throw new Error(
        'Failed to insert new candidate: ' + (err instanceof Error ? err.message : err)
      )
    }
  }

  public deleteCandidateAndTrial(candidateId: number): { success: boolean; error: any } {
    try {
      const stmt = this.db.prepare('DELETE FROM candidate WHERE id = ?')
      const result = stmt.run(candidateId)

      if (result.changes > 0) {
        return { success: true, error: null }
      } else {
        return { success: false, error: 'Candidate not found' }
      }
    } catch (error) {
      console.error('SQL Delete Error:', error)
      return { success: false, error: error }
    }
  }

  public deleteManually(candidateId: number): { success: boolean; error: any } {
    const deleteTransaction = this.db.transaction((id: number) => {
      // 1. Delete associated trails first
      this.db.prepare('DELETE FROM trial WHERE candidate_id = ?').run(id)

      // 2. Then delete the candidate
      const result = this.db.prepare('DELETE FROM candidate WHERE id = ?').run(id)

      return result.changes > 0
    })

    try {
      const success = deleteTransaction(candidateId)
      return { success, error: null }
    } catch (error) {
      return { success: false, error: error }
    }
  }

  public getTrialByCandidateId(candidateId: number): TrialRow {
    return this.db
      .prepare(`SELECT * FROM trial WHERE candidate_id = ?`)
      .get(candidateId) as TrialRow
  }

  public updateTrial(trial: TrialRow): { success: boolean; changes?: number; error?: string } {
    try {
      // 1. Validation: Ensure ID exists before attempting update
      if (!trial.id) {
        return { success: false, error: 'Missing Trail ID' }
      }

      const stmt = this.db.prepare(`
      UPDATE trial
      SET crimped_t = ?,
      failed_t = ?, 
      remaining_time = ?, 
      result = ?, 
      level = ?, 
      class = ?
      WHERE id = ?`)

      const info = stmt.run(
        trial.crimped_t,
        trial.failed_t,
        trial.remaining_time,
        trial.result,
        trial.level,
        trial.class,
        trial.id
      )

      // 2. Check if any row was actually updated
      if (info.changes === 0) {
        return { success: false, error: 'No trial found with that ID' }
      }

      return { success: true, changes: info.changes }
    } catch (err) {
      // 3. Catch database locks or schema errors
      console.error('Database Update Error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown database error'
      }
    }
  }

  // Method to fetch all trails (for your Shadcn tables later)
  public getAllTrials(): TrialRow[] {
    return this.db.prepare('SELECT * FROM trial ORDER BY created_at DESC').all() as TrialRow[]
  }

  public getAllCandidates(): CandidateRow[] {
    return this.db
      .prepare('SELECT * FROM candidate ORDER BY created_at DESC')
      .all() as CandidateRow[]
  }

  public getSettings(): AppSettings {
    return this.db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettings
  }

  public updateSettings(appSetting: AppSettings): ErrorObject {
    try {
      console.log('Updating settings in DB: ', appSetting)

      // 1. Simplify the language logic (Default to Arabic if something goes wrong)
      const languageToSave = Object.values(Languages).includes(appSetting.language!)
        ? appSetting.language
        : Languages.fr

      const stmt = this.db.prepare(`
      UPDATE app_settings 
      SET language = ?, 
      terminals = ?, 
      level_1 = ?, 
      level_2 = ?, 
      level_3 = ?, 
      module_number = ? 
      WHERE id = 1`)

      const info = stmt.run(
        languageToSave,
        appSetting.terminals,
        appSetting.level_1,
        appSetting.level_2,
        appSetting.level_3,
        appSetting.module_number
      )

      // 2. Check if ID 1 actually exists
      if (info.changes === 0) {
        return { success: false, error: 'Settings row (ID: 1) not found in database.' }
      }

      return { success: true, changes: info.changes }
    } catch (err) {
      // 3. Catch structural errors (e.g., database file is read-only or column missing)
      console.error('Database Update Error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'An unexpected database error occurred'
      }
    }
  }

  public updateLanguage(language: Languages): ErrorObject {
    try {
      // 1. Cleaner validation logic
      const validLanguages = Object.values(Languages)
      const languageToSave = validLanguages.includes(language) ? language : Languages.ar

      const stmt = this.db.prepare(`
      UPDATE app_settings 
      SET language = ? 
      WHERE id = 1
    `)

      const result = stmt.run(languageToSave)

      // 2. Check if the row actually existed
      if (result.changes === 0) {
        return { success: false, error: 'Settings record not found (ID 1 missing).' }
      }

      console.log('Language updated successfully to:', languageToSave)
      return { success: true }
    } catch (error) {
      // 3. Catch DB locks or connection issues
      const message = error instanceof Error ? error.message : 'Unknown DB error'
      console.error('Failed to update language:', message)
      return { success: false, error: message }
    }
  }

  // Close the database connection gracefully
  closeDB(): void {
    this.db.close()
    console.log('Database connection closed.')
  }
}

export default AppDatabase // Export as a singleton for easy use

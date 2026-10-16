import type { ApplicationDatabase } from '../../db/ApplicationDatabase'

export interface StreakRepository {
  recordVisit(now?: Date): Promise<number>
}

export class IndexedDBStreakRepository implements StreakRepository {
  private readonly db: ApplicationDatabase
  constructor(db: ApplicationDatabase) {
    this.db = db
  }

  async recordVisit(now = new Date()): Promise<number> {
    // Compare local calendar dates, independent of daylight-saving day lengths.
    const today = Math.floor(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
    )
    if (!Number.isFinite(today)) throw new Error('Invalid visit date.')
    return this.db.transaction('rw', this.db.metadata, async () => {
      const last = (await this.db.metadata.get('streak-last-day'))?.value
      const saved = (await this.db.metadata.get('streak-days'))?.value
      if (
        (last !== undefined && !Number.isSafeInteger(last)) ||
        (saved !== undefined && (!Number.isSafeInteger(saved) || saved < 1)) ||
        (last === undefined) !== (saved === undefined)
      )
        throw new Error('Saved visit streak is invalid.')
      // Repeated visits, concurrent tabs and a clock moving backwards do not add days.
      if (last !== undefined && saved !== undefined && today <= last)
        return saved
      const days = last === today - 1 && saved !== undefined ? saved + 1 : 1
      await this.db.metadata.bulkPut([
        { id: 'streak-last-day', value: today },
        { id: 'streak-days', value: days },
      ])
      return days
    })
  }
}

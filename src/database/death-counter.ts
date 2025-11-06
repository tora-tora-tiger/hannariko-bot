import * as sqlite3 from "sqlite3";
import * as path from "path";

export class DeathCounterDatabase {
  private db: sqlite3.Database;

  constructor() {
    const dbPath = path.join(process.cwd(), "death-counter.db");
    this.db = new sqlite3.Database(dbPath);
  }

  async initialize(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.run(
        `
          CREATE TABLE IF NOT EXISTS death_counter (
            user_id TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0
          );
        `,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async incrementUserCount(userId: string, increment: number): Promise<number> {
    if (increment <= 0) {
      return this.getUserCount(userId);
    }

    await new Promise<void>((resolve, reject) => {
      this.db.run(
        `
          INSERT INTO death_counter (user_id, count)
          VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET count = count + excluded.count;
        `,
        [userId, increment],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    return this.getUserCount(userId);
  }

  private async getUserCount(userId: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.db.get(
        `
          SELECT count FROM death_counter WHERE user_id = ?;
        `,
        [userId],
        (err, row: { count: number } | undefined) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.count ?? 0);
          }
        }
      );
    });
  }

  close(): void {
    this.db.close();
  }
}

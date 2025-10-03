import sqlite3 from "sqlite3";
import { promisify } from "util";
import path from "path";

export interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  results: number;
}

class SearchHistoryDB {
  private db: sqlite3.Database;
  private dbRun: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private initialized: Promise<void>;

  constructor() {
    const dbPath = path.join(process.cwd(), "prisma", "search-history.db");
    this.db = new sqlite3.Database(dbPath);

    // Promisify database methods
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));

    // Initialize database and wait for completion
    this.initialized = this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS search_history (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          results INTEGER DEFAULT 0
        )
      `);
      console.log("Search history database initialized");
    } catch (error) {
      console.error("Error initializing search history database:", error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  async addSearchHistory(query: string, results: number = 0): Promise<void> {
    try {
      await this.ensureInitialized();
      const id = this.generateId();
      const timestamp = new Date().toISOString();

      await this.dbRun(
        "INSERT INTO search_history (id, query, timestamp, results) VALUES (?, ?, ?, ?)",
        [id, query, timestamp, results]
      );
    } catch (error) {
      console.error("Error adding search history:", error);
      throw error;
    }
  }

  async getSearchHistory(limit: number = 50): Promise<SearchHistoryEntry[]> {
    try {
      await this.ensureInitialized();
      const rows = await this.dbAll(
        "SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?",
        [limit]
      );

      return rows.map((row) => ({
        id: row.id,
        query: row.query,
        timestamp: row.timestamp,
        results: row.results,
      }));
    } catch (error) {
      console.error("Error fetching search history:", error);
      throw error;
    }
  }

  async clearSearchHistory(): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.dbRun("DELETE FROM search_history");
    } catch (error) {
      console.error("Error clearing search history:", error);
      throw error;
    }
  }

  async deleteSearchHistory(id: string): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.dbRun("DELETE FROM search_history WHERE id = ?", [id]);
    } catch (error) {
      console.error("Error deleting search history entry:", error);
      throw error;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let searchHistoryDB: SearchHistoryDB | null = null;

export function getSearchHistoryDB(): SearchHistoryDB {
  if (!searchHistoryDB) {
    searchHistoryDB = new SearchHistoryDB();
  }
  return searchHistoryDB;
}

// Export the class for testing
export { SearchHistoryDB };

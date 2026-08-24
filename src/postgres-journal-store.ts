import type { JournalEvent, JournalStore } from "./trading-journal.js";

export interface SqlQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
}

export interface SqlTransaction {
  query<Row = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<SqlQueryResult<Row>>;
}

export interface TransactionalSqlClient {
  transaction<T>(operation: (transaction: SqlTransaction) => Promise<T>): Promise<T>;
  query<Row = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<SqlQueryResult<Row>>;
}

interface JournalEventRow {
  payload: JournalEvent;
}

export class PostgresJournalStore implements JournalStore {
  constructor(private readonly client: TransactionalSqlClient) {}

  async append(event: JournalEvent): Promise<void> {
    await this.client.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO journal_events (event_id, event_type, occurred_at, payload)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), $4::jsonb)`,
        [event.id, event.type, event.timestampMs, JSON.stringify(event)],
      );
    });
  }

  async appendBatch(events: JournalEvent[]): Promise<void> {
    if (events.length === 0) return;
    const ids = new Set<string>();
    for (const event of events) {
      if (ids.has(event.id)) throw new Error(`Duplicate event inside journal batch: ${event.id}`);
      ids.add(event.id);
    }
    await this.client.transaction(async (transaction) => {
      for (const event of events) {
        await transaction.query(
          `INSERT INTO journal_events (event_id, event_type, occurred_at, payload)
           VALUES ($1, $2, to_timestamp($3 / 1000.0), $4::jsonb)`,
          [event.id, event.type, event.timestampMs, JSON.stringify(event)],
        );
      }
    });
  }

  async readAll(): Promise<JournalEvent[]> {
    const result = await this.client.query<JournalEventRow>(
      `SELECT payload
       FROM journal_events
       ORDER BY sequence_id ASC`,
    );
    return result.rows.map((row) => structuredClone(row.payload));
  }
}

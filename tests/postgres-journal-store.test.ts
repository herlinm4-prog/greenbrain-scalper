import { describe, expect, it } from "vitest";
import { PostgresJournalStore, type SqlQueryResult, type SqlTransaction, type TransactionalSqlClient } from "../src/postgres-journal-store.js";
import type { JournalEvent } from "../src/trading-journal.js";

class FakeSqlClient implements TransactionalSqlClient, SqlTransaction {
  rows: { payload: JournalEvent }[] = [];
  committedTransactions = 0;
  failOnInsertNumber?: number;
  private insertNumber = 0;

  async transaction<T>(operation: (transaction: SqlTransaction) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.rows);
    try {
      const result = await operation(this);
      this.committedTransactions += 1;
      return result;
    } catch (error) {
      this.rows = snapshot;
      throw error;
    }
  }

  async query<Row = Record<string, unknown>>(sql: string, parameters: unknown[] = []): Promise<SqlQueryResult<Row>> {
    if (sql.includes("INSERT INTO journal_events")) {
      this.insertNumber += 1;
      if (this.failOnInsertNumber === this.insertNumber) throw new Error("database insert failed");
      const payload = JSON.parse(String(parameters[3])) as JournalEvent;
      if (this.rows.some((row) => row.payload.id === payload.id)) throw new Error("unique event id violation");
      this.rows.push({ payload });
      return { rows: [] };
    }
    return { rows: structuredClone(this.rows) as Row[] };
  }
}

const event = (id: string, timestampMs: number): JournalEvent => ({
  id,
  type: "receipt",
  timestampMs,
  receipt: {
    orderId: `order-${id}`,
    broker: "paper",
    status: "rejected",
    filledUnits: 0,
    timestampMs,
    reason: "test",
  },
});

describe("PostgresJournalStore", () => {
  it("persists and replays events in database order", async () => {
    const client = new FakeSqlClient();
    const store = new PostgresJournalStore(client);
    await store.append(event("one", 1));
    await store.append(event("two", 2));

    expect((await store.readAll()).map((item) => item.id)).toEqual(["one", "two"]);
    expect(client.committedTransactions).toBe(2);
  });

  it("rolls back an entire batch if any event fails", async () => {
    const client = new FakeSqlClient();
    client.failOnInsertNumber = 2;
    const store = new PostgresJournalStore(client);

    await expect(store.appendBatch([event("one", 1), event("two", 2)])).rejects.toThrow("database insert failed");
    expect(await store.readAll()).toHaveLength(0);
  });

  it("rejects duplicate identities", async () => {
    const client = new FakeSqlClient();
    const store = new PostgresJournalStore(client);
    await store.append(event("same", 1));
    await expect(store.append(event("same", 2))).rejects.toThrow("unique event id");
  });
});

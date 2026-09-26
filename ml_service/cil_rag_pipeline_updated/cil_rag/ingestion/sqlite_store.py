"""
Structured store: every table row also lands here in its original column
form, separate from the row-sentence that gets embedded. This is what the
query-time router hits for aggregate/exact questions ("how many mines...",
"what was the CAPEX target for 2019-20") instead of asking an LLM to add up
numbers out of retrieved text -- see query/router.py.
"""
import sqlite3
import json

DB_PATH = "data/structured_store.db"


def init_db(db_path: str = DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS table_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id TEXT,
            table_caption TEXT,
            page_number INTEGER,
            section_heading TEXT,
            row_index INTEGER,
            row_json TEXT
        )
    """)
    # One row per distinct table, so the router can find which table's schema
    # matches a query before deciding to hit table_rows.
    conn.execute("""
        CREATE TABLE IF NOT EXISTS table_schemas (
            table_id TEXT PRIMARY KEY,
            caption TEXT,
            columns TEXT,
            page_number INTEGER,
            section_heading TEXT
        )
    """)
    conn.commit()
    return conn


def store_table(conn, page_number: int, section_heading: str, table) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO table_schemas (table_id, caption, columns, page_number, section_heading) "
        "VALUES (?, ?, ?, ?, ?)",
        (table.table_id, table.caption, json.dumps(table.columns), page_number, section_heading),
    )
    # Idempotent: cached pages are re-stored on every run, so clear this
    # table's rows for this page first or each rerun duplicates them.
    conn.execute("DELETE FROM table_rows WHERE table_id = ? AND page_number = ?",
                 (table.table_id, page_number))
    for i, row in enumerate(table.rows):
        conn.execute(
            "INSERT INTO table_rows (table_id, table_caption, page_number, section_heading, row_index, row_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (table.table_id, table.caption, page_number, section_heading, i, json.dumps(row)),
        )
    conn.commit()


def get_rows_for_table(conn, table_id: str) -> list:
    cur = conn.execute("SELECT row_json FROM table_rows WHERE table_id = ? ORDER BY page_number, row_index", (table_id,))
    return [json.loads(r[0]) for r in cur.fetchall()]


def list_table_schemas(conn) -> list:
    """What the query-time router searches to decide which table (if any) a
    question should be answered from structurally rather than semantically."""
    cur = conn.execute("SELECT table_id, caption, columns, page_number, section_heading FROM table_schemas")
    return [
        {"table_id": r[0], "caption": r[1], "columns": json.loads(r[2]), "page_number": r[3], "section_heading": r[4]}
        for r in cur.fetchall()
    ]

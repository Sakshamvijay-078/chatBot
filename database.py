import sqlite3
from datetime import datetime

DB = "chat.db"

def get_connection():
    return sqlite3.connect(DB)

def init_db():
    conn = get_connection()
    cur = conn.cursor()
    # Phase 3: Added summaries table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            thread_id TEXT PRIMARY KEY,
            summary TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS chats (
            thread_id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fact TEXT,
            importance INTEGER,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()

def create_chat(thread_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO chats VALUES (?, ?, ?)",
        (thread_id, "New Chat", datetime.now().isoformat())
    )
    conn.commit()
    conn.close()

def get_chats():
    conn = get_connection()
    cur = conn.cursor()
    chats = cur.execute(
        "SELECT thread_id, title FROM chats ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return chats

def update_title(thread_id, title):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE chats SET title=? WHERE thread_id=?", (title, thread_id))
    conn.commit()
    conn.close()

def save_message(thread_id, role, content):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO messages(thread_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (thread_id, role, content, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()

def get_messages(thread_id):
    conn = get_connection()
    cur = conn.cursor()
    messages = cur.execute(
        "SELECT role, content FROM messages WHERE thread_id=? ORDER BY id",
        (thread_id,)
    ).fetchall()
    conn.close()
    return messages

def delete_chat(thread_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM messages WHERE thread_id=?", (thread_id,))
    cur.execute("DELETE FROM chats WHERE thread_id=?", (thread_id,))
    cur.execute("DELETE FROM summaries WHERE thread_id=?", (thread_id,)) # Also clear memory
    conn.commit()
    conn.close()

# ---------------- Phase 3: Memory Functions ----------------

def get_summary(thread_id):
    conn = get_connection()
    cur = conn.cursor()
    res = cur.execute("SELECT summary FROM summaries WHERE thread_id=?", (thread_id,)).fetchone()
    conn.close()
    return res[0] if res else ""

def save_summary(thread_id, summary):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "REPLACE INTO summaries (thread_id, summary) VALUES (?, ?)", 
        (thread_id, summary)
    )
    conn.commit()
    conn.close()

def count_messages(thread_id):
    conn = get_connection()
    cur = conn.cursor()
    res = cur.execute("SELECT COUNT(*) FROM messages WHERE thread_id=?", (thread_id,)).fetchone()
    conn.close()
    return res[0]

def get_recent_messages(thread_id, limit=6):
    conn = get_connection()
    cur = conn.cursor()
    # Get the last N messages, then order them chronologically
    messages = cur.execute(
        """
        SELECT role, content FROM (
            SELECT id, role, content FROM messages 
            WHERE thread_id=? ORDER BY id DESC LIMIT ?
        ) ORDER BY id ASC
        """,
        (thread_id, limit)
    ).fetchall()
    conn.close()
    return messages

def delete_old_messages(thread_id, keep=6):
    conn = get_connection()
    cur = conn.cursor()
    # Keep the latest N messages, delete the rest
    cur.execute(
        """
        DELETE FROM messages WHERE thread_id=? AND id NOT IN (
            SELECT id FROM messages WHERE thread_id=? ORDER BY id DESC LIMIT ?
        )
        """, 
        (thread_id, thread_id, keep)
    )
    conn.commit()
    conn.close()


# ---------------- Phase 4: User Memory Functions ----------------

def save_user_fact(fact, importance=5):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO user_memory (fact, importance, created_at) VALUES (?, ?, ?)",
        (fact, importance, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()

def get_user_facts():
    conn = get_connection()
    cur = conn.cursor()
    # Fetch facts, highest importance first
    facts = cur.execute(
        "SELECT fact FROM user_memory ORDER BY importance DESC, created_at ASC"
    ).fetchall()
    conn.close()
    
    # Return a clean list of strings instead of tuples
    return [f[0] for f in facts]
import os
import random
from datetime import datetime, timezone
import psycopg2
import json
import asyncio
from typing import Optional
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


load_dotenv()

app = FastAPI(
    title="Grid Data API",
    description="API for simulating and retrieving grid data.",
    version="1.0.0"
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GridData(BaseModel):
    id: int
    timestamp: datetime
    voltage: float
    current: float
    frequency: float | None = None

class NewGridDataResponse(BaseModel):
    message: str
    rows_inserted: int

# --- WebSocket Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Function to connect to the database
def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "db"),
            database=os.getenv("POSTGRES_DB", "grid_db"),
            user=os.getenv("POSTGRES_USER", "user"),
            password=os.getenv("POSTGRES_PASSWORD", "password")
        )
        return conn
    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Could not connect to the database.")

@app.get("/data", response_model=list[GridData], summary="Retrieve latest grid data")
async def get_grid_data(limit: int = 100):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(f"SELECT id, timestamp, voltage, current, frequency FROM grid_data ORDER BY timestamp DESC LIMIT {limit}")
        rows = cur.fetchall()
        cur.close()

        data = []
        for row in rows:
            ts_aware = row[1].replace(tzinfo=timezone.utc) if row[1].tzinfo is None else row[1]
            data.append(GridData(
                id=row[0],
                timestamp=ts_aware,
                voltage=row[2],
                current=row[3],
                frequency=row[4]
            ))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve data: {e}")
    finally:
        if conn:
            conn.close()

@app.post("/generate", summary="Generate and insert new simulated grid data")
async def generate_grid_data(num_records: int = 1):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        inserted_count = 0

        new_records = []
        for _ in range(num_records):
            voltage = round(random.uniform(220.0, 240.0), 2)
            current = round(random.uniform(5.0, 25.0), 2)
            frequency = round(random.uniform(49.9, 50.1), 2)
            timestamp = datetime.now(timezone.utc)

            cur.execute(
                "INSERT INTO grid_data (timestamp, voltage, current, frequency) VALUES (%s, %s, %s, %s) RETURNING id, timestamp, voltage, current, frequency",
                (timestamp, voltage, current, frequency)
            )

            new_record_row = cur.fetchone()
            new_record = GridData(
                id=new_record_row[0],
                timestamp=new_record_row[1].replace(tzinfo=timezone.utc),
                voltage=new_record_row[2],
                current=new_record_row[3],
                frequency=new_record_row[4]
            )
            new_records.append(new_record)
            inserted_count += 1

        conn.commit()
        cur.close()

        # Broadcast the new record to all connected WebSocket clients
        for record in new_records:
            await manager.broadcast(json.dumps(record.model_dump(), default=str))

        return {"message": f"Successfully inserted {inserted_count} new records.", "rows_inserted": inserted_count}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate data: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/data/filter", response_model=list[GridData], summary="Retrieve filtered grid data")
async def filter_grid_data(
    start_timestamp: Optional[str] = Query(None),
    end_timestamp: Optional[str] = Query(None),
    limit: int = 100
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        query = "SELECT id, timestamp, voltage, current, frequency FROM grid_data WHERE 1=1"
        params = []

        if start_timestamp:
            query += " AND timestamp >= %s"
            params.append(start_timestamp)

        if end_timestamp:
            query += " AND timestamp <= %s"
            params.append(end_timestamp)

        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        data = []
        for row in rows:
            ts_aware = row[1].replace(tzinfo=timezone.utc) if row[1].tzinfo is None else row[1]
            data.append(GridData(
                id=row[0],
                timestamp=ts_aware,
                voltage=row[2],
                current=row[3],
                frequency=row[4]
            ))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve filtered data: {e}")
    finally:
        if conn:
            conn.close()

@app.delete("/data", summary="Delete all grid data records")
async def delete_all_data():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM grid_data")
        conn.commit()
        cur.close()
        return {"message": "All grid data records have been deleted."}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete data: {e}")
    finally:
        if conn:
            conn.close()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We expect the frontend to send a message to keep the connection alive, but we don't need to do anything with it.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("WebSocket disconnected.")

@app.get("/health", summary="Health check endpoint")
async def health_check():
    conn = None
    try:
        conn = get_db_connection()
        if conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            return {"status": "healthy", "database_connection": "ok"}
        else:
            raise Exception("Database connection failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Service unhealthy: {e}")
    finally:
        if conn:
            conn.close()
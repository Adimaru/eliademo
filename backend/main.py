import os
import random
from datetime import datetime, timezone
import psycopg2
import json
import asyncio
from typing import Optional, List
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import google.generativeai as genai
from google.generativeai import GenerativeModel

load_dotenv()

# --- AI Setup ---
# Configure the Google Generative AI with the API key from .env
# The application will fail to start if the key is not set.
try:
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    model = GenerativeModel(model_name="gemini-1.5-flash")
except Exception as e:
    print(f"Failed to configure Google Generative AI: {e}")
    # This will allow the rest of the application to run even if the AI is not configured
    # The /report endpoint will still raise an HTTPException.
    model = None


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
    frequency: Optional[float] = None

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

@app.get("/data", response_model=List[GridData], summary="Retrieve latest grid data")
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

        new_records = []
        for i in range(num_records):
            # We'll use a random number to decide if an anomaly should occur
            if random.random() < 0.1: # 10% chance of an anomaly
                voltage = round(random.uniform(210.0, 214.0) if random.random() > 0.5 else random.uniform(246.0, 250.0), 2)
                current = round(random.uniform(20.1, 30.0), 2)
            else:
                voltage = round(random.uniform(220.0, 240.0), 2)
                current = round(random.uniform(5.0, 20.0), 2)

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

        conn.commit()
        cur.close()

        # Broadcast the new record to all connected WebSocket clients
        for record in new_records:
            await manager.broadcast(json.dumps(record.model_dump(), default=str))

        return {"message": f"Successfully inserted {len(new_records)} new records.", "rows_inserted": len(new_records)}
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate data: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/data/filter", response_model=List[GridData], summary="Retrieve filtered grid data")
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

@app.post("/report")
async def generate_report(records: List[GridData] = Body(...)):
    """Generate a summarized report based on provided data using AI."""
    if not model:
        raise HTTPException(status_code=500, detail="AI model is not configured. Please check GEMINI_API_KEY.")

    if not records:
        raise HTTPException(status_code=400, detail="No data provided to generate a report.")

    # Convert records to a list of dictionaries for the prompt
    records_dict = [record.model_dump() for record in records]

    # Craft a detailed prompt for the AI
    prompt = f"""
    You are a smart grid data analyst. I will provide you with a list of smart grid sensor readings in JSON format.
    Your task is to analyze this data and generate a professional, well-structured report.

    The data contains the following fields: 'id', 'timestamp', 'voltage', 'current', and 'frequency'.

    The report should include the following sections, formatted using Markdown:

    # Smart Grid Analysis Report

    ## 1. Overview
    - Provide a high-level summary of the data, including the total number of records analyzed and the time range covered.

    ## 2. Key Metrics
    - **Average Voltage:** The average voltage across all records.
    - **Average Current:** The average current across all records.
    - **Peak Values:** The maximum voltage and maximum current recorded.
    - **Min Values:** The minimum voltage and minimum current recorded.

    ## 3. Anomaly Detection
    - Anomaly thresholds are defined as:
        - Voltage: below 215V or above 245V.
        - Current: above 20A.
    - Analyze the data to identify and count any records that fall outside these thresholds.
    - Provide a summary of the anomalies detected.

    ## 4. Conclusion & Recommendations
    - Conclude with an overall assessment of the grid's stability during the analyzed period.
    - Provide a brief recommendation based on the findings (e.g., "The grid appears stable" or "Further investigation into the voltage fluctuations is recommended").

    Here is the data in JSON format:

    {json.dumps(records_dict, indent=2, default=str)}
    """

    try:
        # Generate content using the AI model
        response = model.generate_content(prompt)
        # The AI's response is in Markdown format, which is perfect for display
        return {"report": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report with AI: {e}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
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
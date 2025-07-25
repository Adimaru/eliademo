# backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
import psycopg2
import os
import random
from dotenv import load_dotenv


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
    allow_methods=["*"], # Allows all methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
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
    """
    Retrieves the latest simulated grid data from the database.
    """
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

@app.post("/generate", response_model=NewGridDataResponse, summary="Generate and insert new simulated grid data")
async def generate_grid_data(num_records: int = 10):
    """
    Generates and inserts new simulated grid data into the database.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        inserted_count = 0
        for _ in range(num_records):
            voltage = round(random.uniform(220.0, 240.0), 2)
            current = round(random.uniform(5.0, 25.0), 2)
            frequency = round(random.uniform(49.9, 50.1), 2) 

            cur.execute(
                "INSERT INTO grid_data (timestamp, voltage, current, frequency) VALUES (%s, %s, %s, %s)",
                (datetime.now(timezone.utc), voltage, current, frequency)
            )
            inserted_count += 1
        conn.commit()
        cur.close()
        return {"message": f"Successfully inserted {inserted_count} new records.", "rows_inserted": inserted_count}
    except Exception as e:
        if conn:
            conn.rollback() # Rollback on error
        raise HTTPException(status_code=500, detail=f"Failed to generate data: {e}")
    finally:
        if conn:
            conn.close()

@app.get("/", summary="Root endpoint")
async def read_root():
    return {"message": "Welcome to the Grid Data API! Visit /docs for API documentation."}
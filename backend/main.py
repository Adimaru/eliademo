import os
import random
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

# --- Database Imports ---
from sqlalchemy import create_engine, Column, Integer, Float, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# --- AI Imports ---
import google.generativeai as genai
from google.generativeai import GenerativeModel

load_dotenv()

# --- AI Setup ---
try:
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    model = GenerativeModel(model_name="gemini-1.5-flash")
except Exception as e:
    print(f"Failed to configure Google Generative AI: {e}")
    model = None

# --- SQLAlchemy / In-Memory SQLite Setup ---
# Use an in-memory SQLite database which is reset on every application restart.
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class GridDataModel(Base):
    __tablename__ = "grid_data"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), default=datetime.now(timezone.utc))
    voltage = Column(Float)
    current = Column(Float)
    frequency = Column(Float, nullable=True)

# Function to get a database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# FastAPI application lifecycle management
# We use this to run code when the app starts up and shuts down
@asynccontextmanager
async def lifespan(app: FastAPI):
    # This code runs on startup
    print("Creating tables and inserting initial data...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Insert initial data
        initial_records = [
            GridDataModel(voltage=230.1, current=10.5, frequency=50.0),
            GridDataModel(voltage=231.5, current=12.1, frequency=50.1),
            GridDataModel(voltage=229.8, current=9.7, frequency=49.9),
        ]
        db.add_all(initial_records)
        db.commit()
        print("Initial data inserted successfully.")
    except Exception as e:
        print(f"Failed to insert initial data: {e}")
        db.rollback()
    finally:
        db.close()
    yield
    # This code runs on shutdown
    print("Application shutting down.")

app = FastAPI(
    title="Grid Data API",
    description="API for simulating and retrieving grid data.",
    version="1.0.0",
    lifespan=lifespan # Link the lifespan function to the app
)

# --- API Routes ---
@app.get("/")
async def read_root():
    return {"message": "Welcome to the Grid Data API. Use /docs for API documentation."}

# --- CORS Middleware ---
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://incandescent-empanada-b2c1da.netlify.app",
    "https://eliademo.onrender.com",
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
    class Config:
        from_attributes = True

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

# --- Existing API Routes ---
@app.get("/data", response_model=List[GridData], summary="Retrieve latest grid data")
async def get_grid_data(db: Session = Depends(get_db), limit: int = 100):
    data = db.query(GridDataModel).order_by(GridDataModel.timestamp.desc()).limit(limit).all()
    return data

@app.post("/generate", summary="Generate and insert new simulated grid data")
async def generate_grid_data(db: Session = Depends(get_db), num_records: int = 1):
    new_records = []
    for _ in range(num_records):
        if random.random() < 0.1:
            voltage = round(random.uniform(210.0, 214.0) if random.random() > 0.5 else random.uniform(246.0, 250.0), 2)
            current = round(random.uniform(20.1, 30.0), 2)
        else:
            voltage = round(random.uniform(220.0, 240.0), 2)
            current = round(random.uniform(5.0, 20.0), 2)
        frequency = round(random.uniform(49.9, 50.1), 2)
        timestamp = datetime.now(timezone.utc)
        new_record = GridDataModel(
            timestamp=timestamp,
            voltage=voltage,
            current=current,
            frequency=frequency
        )
        db.add(new_record)
        new_records.append(new_record)
    db.commit()
    for record in new_records:
        db.refresh(record)
    
    for record in new_records:
        await manager.broadcast(json.dumps(record.__dict__, default=str))

    return {"message": f"Successfully inserted {len(new_records)} new records.", "rows_inserted": len(new_records)}

@app.get("/data/filter", response_model=List[GridData], summary="Retrieve filtered grid data")
async def filter_grid_data(
    start_timestamp: Optional[str] = Query(None),
    end_timestamp: Optional[str] = Query(None),
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(GridDataModel)
    if start_timestamp:
        query = query.filter(GridDataModel.timestamp >= datetime.fromisoformat(start_timestamp.replace('Z', '+00:00')))
    if end_timestamp:
        query = query.filter(GridDataModel.timestamp <= datetime.fromisoformat(end_timestamp.replace('Z', '+00:00')))
    data = query.order_by(GridDataModel.timestamp.desc()).limit(limit).all()
    return data

@app.delete("/data", summary="Delete all grid data records")
async def delete_all_data(db: Session = Depends(get_db)):
    db.query(GridDataModel).delete()
    db.commit()
    return {"message": "All grid data records have been deleted."}

@app.post("/report")
async def generate_report(records: List[GridData] = Body(...)):
    if not model:
        raise HTTPException(status_code=500, detail="AI model is not configured. Please check GEMINI_API_KEY.")
    if not records:
        raise HTTPException(status_code=400, detail="No data provided to generate a report.")
    
    records_dict = [record.model_dump() for record in records]
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
        response = model.generate_content(prompt)
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
async def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database_connection": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Service unhealthy: {e}")


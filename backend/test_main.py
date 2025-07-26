import pytest
from fastapi.testclient import TestClient
from main import app, get_db_connection
import psycopg2
import os
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Use a temporary test database for isolation
def setup_test_database():
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "db"),
            database=os.getenv("POSTGRES_DB", "grid_db"),
            user=os.getenv("POSTGRES_USER", "user"),
            password=os.getenv("POSTGRES_PASSWORD", "password")
        )
        return conn
    except psycopg2.Error as e:
        print(f"Test database connection error: {e}")
        return None

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as client:
        # Set up the test environment before tests
        conn = setup_test_database()
        if conn:
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cur = conn.cursor()
            cur.execute("DELETE FROM grid_data") # Clean up before each test run
            cur.close()
            conn.close()

        yield client

        # Clean up after tests
        conn = setup_test_database()
        if conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM grid_data")
            cur.close()
            conn.close()

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database_connection": "ok"}

def test_generate_data(client):
    response = client.post("/generate", params={"num_records": 5})
    assert response.status_code == 200
    assert response.json()["rows_inserted"] == 5

    # Verify data was inserted
    data_response = client.get("/data", params={"limit": 10})
    assert data_response.status_code == 200
    assert len(data_response.json()) >= 5

def test_delete_all_data(client):
    # First, generate some data
    client.post("/generate", params={"num_records": 1})
    # Then, delete it
    response = client.delete("/data")
    assert response.status_code == 200
    assert response.json() == {"message": "All grid data records have been deleted."}
    # Verify data is gone
    data_response = client.get("/data")
    assert data_response.status_code == 200
    assert len(data_response.json()) == 0

def test_filter_data(client):
    # Generate some data first
    client.delete("/data")
    client.post("/generate", params={"num_records": 10})

    # Get all data to find a range
    all_data_response = client.get("/data")
    all_data = all_data_response.json()

    # Select a start and end date from the generated data
    start_date = all_data[5]["timestamp"]
    end_date = all_data[0]["timestamp"]

    response = client.get("/data/filter", params={"start_timestamp": start_date, "end_timestamp": end_date, "limit": 100})

    assert response.status_code == 200
    # Check if the number of filtered records is correct
    assert len(response.json()) > 0
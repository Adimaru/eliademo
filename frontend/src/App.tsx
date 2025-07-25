import React, { useState, useEffect } from 'react';
import logo from './logo.svg';
import './App.css';

interface GridData {
  id: number;
  timestamp: string;
  voltage: number;
  current: number;
  frequency: number;
}

function App() {
  const [data, setData] = useState<GridData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGridData = async () => {
      try {
        // REACT_APP_API_URL is set in Dockerfile as a build arg and ENV var.
        // The Nginx config in frontend/nginx/default.conf will proxy /api requests
        // to the backend service.
        const apiUrl = process.env.REACT_APP_API_URL || '';
        console.log("Fetching from API URL:", apiUrl + "/data"); // Debugging

        const response = await fetch(apiUrl + "/data");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result: GridData[] = await response.json();
        setData(result);
      } catch (e: any) {
        setError(e.message);
        console.error("Error fetching data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchGridData();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Grid Data from FastAPI Backend (via Docker Compose)
        </p>

        {loading && <p>Loading data...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}

        {!loading && !error && (
          data.length > 0 ? (
            <div>
              <h3>Latest Records:</h3>
              <ul>
                {data.map((item) => (
                  <li key={item.id}>
                    ID: {item.id}, Timestamp: {new Date(item.timestamp).toLocaleString()}, Voltage: {item.voltage}V, Current: {item.current}A, Frequency: {item.frequency}Hz
                  </li>
                ))}
              </ul>
              <button onClick={async () => {
                // Example: Generate 1 new record
                try {
                  const apiUrl = process.env.REACT_APP_API_URL || '';
                  const response = await fetch(apiUrl + "/generate?num_records=1", { method: 'POST' });
                  if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                  }
                  const result = await response.json();
                  console.log(result.message);
                  // Re-fetch data to update the list
                  window.location.reload(); // Simple reload for now
                } catch (e: any) {
                  console.error("Error generating data:", e);
                }
              }}>Generate 1 More Record</button>
            </div>
          ) : (
            <p>No data found.</p>
          )
        )}
      </header>
    </div>
  );
}

export default App;
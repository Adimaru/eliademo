import React, { useState, useEffect } from 'react';
import './App.css';
import {
  Container,
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  Stack,
  Button,
  TextField
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface GridData {
  id: number;
  timestamp: string;
  voltage: number;
  current: number;
  frequency: number;
}

const App: React.FC = () => {
  const [data, setData] = useState<GridData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const fetchData = async (start?: string, end?: string) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      let url = `${apiUrl}/data`;

      if (start || end) {
        url = `${apiUrl}/data/filter`;
        const params = new URLSearchParams();
        if (start) params.append('start_timestamp', new Date(start).toISOString());
        if (end) params.append('end_timestamp', new Date(end).toISOString());
        url = `${url}?${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result: GridData[] = await response.json();
      const sortedData = result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setData(sortedData);
    } catch (e: any) {
      setError(e.message);
      console.error("Error fetching data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch when the component mounts or filters change
    fetchData(startDate, endDate);

    // Set up WebSocket connection
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const newData: GridData = JSON.parse(event.data);
      console.log('New data received via WebSocket:', newData);

      // Update the data state to include the new record
      setData(prevData => {
        const updatedData = [...prevData, newData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return updatedData;
      });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Clean up the WebSocket connection when the component unmounts
    return () => {
      ws.close();
    };
  }, [startDate, endDate]);

  const chartData = {
    labels: data.map(item => new Date(item.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Voltage (V)',
        data: data.map(item => item.voltage),
        borderColor: '#00eaff',
        backgroundColor: 'rgba(0, 234, 255, 0.5)',
      },
      {
        label: 'Current (A)',
        data: data.map(item => item.current),
        borderColor: '#ff1493',
        backgroundColor: 'rgba(255, 20, 147, 0.5)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#b0b0b0',
          font: {
            family: '"Tomorrow"',
          },
        },
      },
      title: {
        display: true,
        text: 'Grid Voltage & Current Over Time',
        color: '#e0e0e0',
        font: {
          family: '"Oxanium"',
          size: 18,
        },
      },
      tooltip: {
        bodyFont: { family: '"Tomorrow"' },
        titleFont: { family: '"Oxanium"' },
      },
    },
    scales: {
      x: {
        ticks: { color: '#b0b0b0', font: { family: '"Tomorrow"' } },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      y: {
        ticks: { color: '#b0b0b0', font: { family: '"Tomorrow"' } },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
    },
  };

  const handleGenerateData = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      // We no longer need to re-fetch data manually; the WebSocket will do it for us.
      const response = await fetch(`${apiUrl}/generate`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    } catch (e: any) {
      console.error("Error generating data:", e);
    }
  };

  const handleDeleteData = async () => {
    if (window.confirm('Are you sure you want to delete all data?')) {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || '';
        const response = await fetch(`${apiUrl}/data`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        await fetchData(); // We still need to fetch here to clear the local state
      } catch (e: any) {
        console.error("Error deleting data:", e);
      }
    }
  };

  if (loading && data.length === 0) {
    return (
      <Container sx={{ textAlign: 'center', mt: 5 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading data...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 5 }}>
        <Alert severity="error">Error fetching data: {error}</Alert>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', fontWeight: 'bold' }}>
        Smart Grid Dashboard
      </Typography>

      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mr: 2 }}>
            <TextField
                label="Start Date"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
            />
            <TextField
                label="End Date"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
            />
            <Button variant="contained" onClick={() => fetchData(startDate, endDate)}>
                Apply Filter
            </Button>
        </Stack>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="success" onClick={handleGenerateData}>
            Generate Record
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteData}>
            Delete All Data
          </Button>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="div" sx={{ mb: 2 }}>
                Voltage & Current Trends
              </Typography>
              {data.length > 0 ? (
                <Line options={chartOptions} data={chartData} />
              ) : (
                <Typography>No data available to display chart.</Typography>
              )}
            </CardContent>
          </Card>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="div" sx={{ mb: 2 }}>
                Latest Records
              </Typography>
              {data.length > 0 ? (
                <List dense>
                  {data.slice(-5).reverse().map((item) => (
                    <ListItem key={item.id} divider>
                      <ListItemText
                        primary={`Voltage: ${item.voltage}V, Current: ${item.current}A`}
                        secondary={`Timestamp: ${new Date(item.timestamp).toLocaleString()}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography>No data found.</Typography>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
};

export default App;
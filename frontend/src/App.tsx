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
        if (start) params.append('start_timestamp', start);
        if (end) params.append('end_timestamp', end);
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
    fetchData(startDate, endDate);
  }, [startDate, endDate]);

  const chartData = {
    labels: data.map(item => new Date(item.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Voltage (V)',
        data: data.map(item => item.voltage),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'Current (A)',
        data: data.map(item => item.current),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Grid Voltage & Current Over Time',
      },
    },
  };

  const handleGenerateData = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/generate`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await fetchData(); // Re-fetch to update the dashboard
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
        await fetchData(); // Re-fetch to show an empty dashboard
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
        <Stack direction="row" spacing={2} sx={{ mr: 2 }}>
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
                  {data.slice(-10).reverse().map((item) => (
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
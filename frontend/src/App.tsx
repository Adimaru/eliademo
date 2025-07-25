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

  useEffect(() => {
    const fetchGridData = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || '';
        const response = await fetch(apiUrl + "/data");
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

    fetchGridData();
  }, []);

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

  if (loading) {
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
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <button onClick={async () => {
                  try {
                    const apiUrl = process.env.REACT_APP_API_URL || '';
                    const response = await fetch(apiUrl + "/generate?num_records=1", { method: 'POST' });
                    if (!response.ok) {
                      throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    console.log("Record generated successfully.");
                    // Re-fetch data to update the list
                    window.location.reload();
                  } catch (e: any) {
                    console.error("Error generating data:", e);
                  }
                }}>Generate 1 More Record</button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Container>
  );
};

export default App;
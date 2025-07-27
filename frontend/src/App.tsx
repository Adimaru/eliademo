import React, { useState, useEffect, useRef } from 'react';
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
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Backdrop,
  styled,
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { WarningAmber, Circle } from '@mui/icons-material';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend
);

// --- Custom Styled Cyberpunk Button ---
const StyledButton = styled(Button)(({ theme, color }) => {
  const paletteColor = (color && color !== 'inherit' && theme.palette[color]) ? color : 'primary';

  return {
    '&.MuiButton-root': {
      '--background-color': theme.palette[paletteColor].main,
      '&.MuiButton-contained': {
          backgroundColor: 'var(--background-color)',
          color: 'var(--cyber-button-text-color)',
          '&:disabled': {
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            color: 'rgba(255, 255, 255, 0.3)',
            borderColor: 'transparent',
          },
      },
    },
    '&.cyberpunk-button': {
      fontFamily: '"Advent Pro"',
      '&:disabled': {
          borderRight: `3px solid rgba(255, 255, 255, 0.3)`,
          clipPath: `polygon(-10px 0%, calc(100% + 10px) 0%, calc(100% + 10px) 100%, 15px 100%, -10px calc(100% - 20px))`,
      },
    }
  };
});

interface GridData {
  id: number;
  timestamp: string;
  voltage: number;
  current: number;
  frequency: number;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const App: React.FC = () => {
  const [data, setData] = useState<GridData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isAnomaly, setIsAnomaly] = useState<boolean>(false);
  const [anomalyMessage, setAnomalyMessage] = useState<string>('');
  const [selectedRecord, setSelectedRecord] = useState<GridData | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [isReportGenerating, setIsReportGenerating] = useState<boolean>(false);
  const ws = useRef<WebSocket | null>(null);

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
    fetchData(startDate, endDate);
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setWsStatus('connected');
    };

    ws.current.onmessage = (event) => {
      const newData: GridData = JSON.parse(event.data);
      setData(prevData => {
        const updatedData = [...prevData, newData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return updatedData;
      });
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setWsStatus('disconnected');
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsStatus('disconnected');
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [startDate, endDate]);

  useEffect(() => {
    if (data.length > 0) {
      const latestRecord = data[data.length - 1];
      const isVoltageAnomaly = latestRecord.voltage < 215 || latestRecord.voltage > 245;
      const isCurrentAnomaly = latestRecord.current > 20;

      if (isVoltageAnomaly || isCurrentAnomaly) {
        let message = 'Anomaly Detected: ';
        if (isVoltageAnomaly) message += `Voltage: ${latestRecord.voltage}V. `;
        if (isCurrentAnomaly) message += `Current: ${latestRecord.current}A.`;
        setAnomalyMessage(message);
        setIsAnomaly(true);
      } else {
        setIsAnomaly(false);
        setAnomalyMessage('');
      }
    }
  }, [data]);

  const chartData = {
    labels: data.map(item => new Date(item.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Voltage (V)',
        data: data.map(item => item.voltage),
        borderColor: '#fffb00ff',
        backgroundColor: 'rgba(0, 0, 0, 1)',
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
          color: '#ffffffff',
          font: { family: '"Advent Pro"' }, // Changed font for legend
        },
      },
      title: {
        display: true,
        text: 'Grid Voltage & Current Over Time',
        color: '#ffffffff',
        font: { family: '"Oxanium"', size: 18 },
      },
      tooltip: {
        bodyFont: { family: '"Advent Pro"' }, // Changed font for tooltip
        titleFont: { family: '"Oxanium"' },
      },
    },
    scales: {
      x: {
        ticks: { color: '#ffffffff', font: { family: '"Advent Pro"' } }, // Changed font for x-axis ticks
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      y: {
        ticks: { color: '#b0b0b0', font: { family: '"Advent Pro"' } }, // Changed font for y-axis ticks
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
      },
    },
  };

  const handleGenerateData = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
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
        await fetchData();
      } catch (e: any) {
        console.error("Error deleting data:", e);
      }
    }
  };

  const handleGenerateReport = async () => {
    if (data.length === 0) {
      alert("No data to generate a report.");
      return;
    }
    setIsReportGenerating(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setReportContent(result.report);
    } catch (e: any) {
      alert("Failed to generate report: " + e.message);
      console.error("Error generating report:", e);
    } finally {
      setIsReportGenerating(false);
    }
  };

  const handleOpenDetails = (record: GridData) => {
    setSelectedRecord(record);
  };

  const handleCloseDetails = () => {
    setSelectedRecord(null);
  };

  const handleCloseReport = () => {
    setReportContent(null);
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
      <Typography
        variant="h4"
        component="h1" // Render as h1 for CSS selector
        className="cyberpunk glitched"
        sx={{ textAlign: 'center', mb: 4 }}
      >
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
            <StyledButton variant="contained" onClick={() => fetchData(startDate, endDate)} className="cyberpunk-button">
                Apply Filter
            </StyledButton>
        </Stack>
        <Stack direction="row" spacing={2}>
          <StyledButton variant="contained" color="success" onClick={handleGenerateData} className="cyberpunk-button">
            Generate Record
          </StyledButton>
          <StyledButton variant="contained" color="error" onClick={handleDeleteData} className="cyberpunk-button">
            Delete All Data
          </StyledButton>
          <StyledButton variant="contained" color="secondary" onClick={handleGenerateReport} disabled={isReportGenerating} className="cyberpunk-button">
            {isReportGenerating ? <CircularProgress size={24} /> : 'Generate Report'}
          </StyledButton>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 2 }}>
          <Card elevation={0}> {/* Removed shadow */}
            <CardContent>
              <Typography variant="h6" component="h2" className="cyberpunk"> {/* Render as h2 for CSS selector */}
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
          <Card sx={{ minHeight: '400px' }} elevation={0}> {/* Removed shadow */}
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" component="h2" className="cyberpunk"> {/* Render as h2 for CSS selector */}
                  Latest Records
                </Typography>
              </Stack>
              <Box sx={{ maxHeight: '300px', overflowY: 'auto' }} className="css-111g8n6">
                {data.length > 0 ? (
                  <List dense>
                    {data.slice(-100).reverse().map((item) => (
                      <ListItem
                        key={item.id}
                        component="button"
                        onClick={() => handleOpenDetails(item)}
                        sx={{
                          backgroundColor: 'rgba(0, 0, 0, 1)',
                          mb: 0.5,
                          borderRadius: '4px',
                          borderBottom: '1px solid var(--yellow-color)', // Changed to yellow border
                          '&:hover': {
                            backgroundColor: 'rgba(0, 0, 0, 1)',
                          },
                        }}
                      >
                        <ListItemText
                          primary={`Voltage: ${item.voltage}V, Current: ${item.current}A`}
                          secondary={`Timestamp: ${new Date(item.timestamp).toLocaleString()}`}
                          primaryTypographyProps={{ color: 'var(--yellow-color)', fontFamily: '"Advent Pro"' }} // Changed to yellow and Advent Pro
                          secondaryTypographyProps={{ color: '#b0b0b0', fontFamily: '"Advent Pro"' }} // Changed to Advent Pro
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography>No data found.</Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Box sx={{ mt: 3, display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <Card elevation={0}> {/* Removed shadow */}
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" component="div" sx={{ fontFamily: '"Advent Pro"' }}> {/* Apply Advent Pro */}
                  System Status:
                </Typography>
                <Circle sx={{ color: wsStatus === 'connected' ? '#fffb00ff' : '#ff1493', fontSize: 16, animation: wsStatus === 'connected' ? 'pulse 2s infinite' : 'none' }} />
                <Typography variant="body1" sx={{ color: wsStatus === 'connected' ? '#fffb00ff' : '#ff1493', fontWeight: 'bold', fontFamily: '"Advent Pro"' }}> {/* Apply Advent Pro */}
                  {wsStatus === 'connected' ? 'Real-Time Data Feed Connected' : 'Real-Time Data Feed Disconnected'}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {isAnomaly && (
          <Box sx={{ flex: 1 }}>
            <Alert
              severity="warning"
              icon={<WarningAmber fontSize="inherit" />}
              sx={{
                fontFamily: '"Advent Pro"', // Apply Advent Pro
                fontWeight: 'bold',
                animation: 'blink 1s infinite',
                width: '100%',
              }}
            >
              {anomalyMessage}
            </Alert>
          </Box>
        )}
      </Box>

      <Dialog open={!!selectedRecord} onClose={handleCloseDetails}>
        <DialogTitle>
          <Typography variant="h6" component="h2" className="cyberpunk"> {/* Render as h2 for CSS selector */}
            Record Details
          </Typography>
        </DialogTitle>
        <hr className="cyberpunk" /> {/* Use hr tag for separator */}
        <DialogContent>
          {selectedRecord && (
            <Stack spacing={2} sx={{ fontFamily: '"Advent Pro"' }}> {/* Apply Advent Pro */}
              <Typography><strong>Record ID:</strong> {selectedRecord.id}</Typography>
              <Typography><strong>Timestamp:</strong> {new Date(selectedRecord.timestamp).toLocaleString()}</Typography>
              <Typography><strong>Voltage:</strong> {selectedRecord.voltage}V</Typography>
              <Typography><strong>Current:</strong> {selectedRecord.current}A</Typography>
              <Typography><strong>Frequency:</strong> {selectedRecord.frequency}Hz</Typography>
              <Typography>
                <strong>Status:</strong>
                {selectedRecord.voltage < 215 || selectedRecord.voltage > 245 || selectedRecord.current > 20
                  ? <span style={{ color: '#ff6161', fontWeight: 'bold' }}> Anomaly Detected!</span>
                  : <span style={{ color: '#00ff00', fontWeight: 'bold' }}> Normal</span>
                }
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <StyledButton onClick={handleCloseDetails} variant="contained" className="cyberpunk-button">
            Close
          </StyledButton>
        </DialogActions>
      </Dialog>

      <Dialog open={!!reportContent} onClose={handleCloseReport} maxWidth="md" fullWidth>
        <DialogTitle>
          <Typography variant="h6" component="h2" className="cyberpunk"> {/* Render as h2 for CSS selector */}
            AI-Generated Report
          </Typography>
        </DialogTitle>
        <hr className="cyberpunk" /> {/* Use hr tag for separator */}
        <DialogContent>
          {reportContent && (
            <Box
              sx={{
                fontFamily: '"Advent Pro"', // Apply Advent Pro
                whiteSpace: 'pre-wrap',
                color: '#e0e0e0',
                '& h1': { fontFamily: '"Oxanium"', color: '#fffb00ff', mt: 2 },
                '& h2': { fontFamily: '"Oxanium"', color: '#ff1493', mt: 2 },
                '& strong': { color: '#ffffff' },
              }}
              dangerouslySetInnerHTML={{ __html: reportContent }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <StyledButton onClick={handleCloseReport} variant="contained" className="cyberpunk-button">
            Close
          </StyledButton>
        </DialogActions>
      </Dialog>

      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={isReportGenerating}
      >
        <Stack alignItems="center" spacing={2}>
          <CircularProgress color="inherit" />
          <Typography variant="h6" sx={{ fontFamily: '"Oxanium"' }}>Generating Report with AI...</Typography>
        </Stack>
      </Backdrop>
    </Container>
  );
};

export default App;
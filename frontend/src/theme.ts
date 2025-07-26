import { createTheme } from '@mui/material/styles';

export const cyberpunkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00eaff', // Neon Cyan
      light: '#6effff',
      dark: '#00b7d4',
      contrastText: '#000000',
    },
    secondary: {
      main: '#ff1493', // Neon Pink
      light: '#ff66b8',
      dark: '#c70077',
      contrastText: '#ffffff',
    },
    background: {
      default: '#0c0d12',
      paper: '#1a1b26',
    },
    text: {
      primary: '#e0e0e0',
      secondary: '#b0b0b0',
    },
    error: {
      main: '#ff6161',
    },
    success: {
      main: '#00ff00',
    },
  },
  typography: {
    fontFamily: ['"Tomorrow"', 'sans-serif'].join(','),
    h1: {
      fontFamily: '"Advent Pro"',
      fontWeight: 700,
      color: '#00eaff',
      textShadow: '0 0 5px #00eaff, 0 0 10px #00eaff',
    },
    h4: {
      fontFamily: '"Oxanium"',
      fontWeight: 600,
      color: '#ff1493',
      textShadow: '0 0 5px #ff1493, 0 0 10px #ff1493',
    },
    h6: {
      fontFamily: '"Oxanium"',
      fontWeight: 500,
    },
    body1: {
      fontFamily: '"Tomorrow"',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #00eaff',
          boxShadow: '0 0 15px rgba(0, 234, 255, 0.4)',
          background: 'rgba(26, 27, 38, 0.8)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: '"Oxanium"',
          fontWeight: 600,
          border: '1px solid',
        },
        contained: {
          boxShadow: '0 0 5px rgba(0, 234, 255, 0.5)',
          '&:hover': {
            boxShadow: '0 0 15px rgba(0, 234, 255, 0.8)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputLabel-root': {
            color: '#b0b0b0',
          },
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#00eaff',
            },
            '&:hover fieldset': {
              borderColor: '#6effff',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00eaff',
            },
            color: '#e0e0e0',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          fontFamily: '"Tomorrow"',
          backgroundColor: 'rgba(255, 20, 147, 0.2)',
          color: '#ff1493',
          border: '1px solid #ff1493',
        },
      },
    },
  },
});
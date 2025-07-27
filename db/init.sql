-- db/init.sql

-- Drop the table if it already exists (useful for development resets)
DROP TABLE IF EXISTS grid_data;

-- Create the grid_data table
CREATE TABLE grid_data (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    voltage REAL NOT NULL,
    current REAL NOT NULL,
    frequency REAL -- NO COMMA HERE!
);

-- Optional: Insert some initial dummy data for testing purposes
INSERT INTO grid_data (voltage, current, frequency) VALUES
(230.1, 10.5, 50.0),
(231.5, 12.1, 50.1),
(229.8, 9.7, 49.9);


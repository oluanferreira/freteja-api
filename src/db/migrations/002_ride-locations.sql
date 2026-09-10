-- Migration 002: Ride Locations (GPS tracking history per ride)

CREATE TABLE ride_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  speed DECIMAL(5,2),
  heading DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for location queries
CREATE INDEX idx_ride_locations_geo ON ride_locations USING GIST (location);

-- Performance: latest location per ride
CREATE INDEX idx_ride_locations_ride_time ON ride_locations (ride_id, created_at DESC);

-- Add completed_at to rides (for tracking completion time)
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

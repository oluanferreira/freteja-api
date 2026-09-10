-- Migration 001: Initial Schema
-- FreteJá - Uber de Frete

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enum types
CREATE TYPE user_role AS ENUM ('embarcador', 'motorista', 'admin');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'active', 'suspended', 'blocked');
CREATE TYPE ride_status AS ENUM (
  'pending', 'accepted', 'collecting', 'in_transit',
  'delivering', 'completed', 'cancelled'
);
CREATE TYPE vehicle_type AS ENUM ('carro', 'utilitario', 'van', 'caminhao');
CREATE TYPE payment_method AS ENUM ('pix', 'cartao', 'dinheiro');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  cpf_cnpj VARCHAR(20) UNIQUE,
  role user_role NOT NULL,
  status user_status NOT NULL DEFAULT 'pending',
  avatar_url TEXT,
  rating_avg DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vehicles (motorista)
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type vehicle_type NOT NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  year INTEGER NOT NULL,
  plate VARCHAR(10) UNIQUE NOT NULL,
  color VARCHAR(50),
  capacity_kg DECIMAL(10,2),
  photo_urls TEXT[],
  crlv_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Driver documents
CREATE TABLE driver_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cnh_front_url TEXT NOT NULL,
  cnh_back_url TEXT NOT NULL,
  selfie_url TEXT NOT NULL,
  cnh_number VARCHAR(20),
  cnh_expiry DATE,
  ocr_data JSONB,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Driver location (real-time)
CREATE TABLE driver_locations (
  driver_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  heading DECIMAL(5,2),
  speed DECIMAL(5,2),
  available BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rides
CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  embarcador_id UUID NOT NULL REFERENCES users(id),
  driver_id UUID REFERENCES users(id),
  status ride_status NOT NULL DEFAULT 'pending',
  -- Origin and Destination
  origin_address TEXT NOT NULL,
  origin_location GEOGRAPHY(POINT, 4326) NOT NULL,
  destination_address TEXT NOT NULL,
  destination_location GEOGRAPHY(POINT, 4326) NOT NULL,
  -- Cargo
  cargo_description TEXT NOT NULL,
  cargo_category VARCHAR(100),
  cargo_photo_urls TEXT[],
  weight_range VARCHAR(50),
  volume_range VARCHAR(50),
  vehicle_type_preferred vehicle_type,
  notes TEXT,
  -- Pricing
  suggested_price DECIMAL(10,2) NOT NULL,
  final_price DECIMAL(10,2),
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.12,
  commission_amount DECIMAL(10,2),
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  schedule_window_minutes INTEGER,
  -- Timestamps
  accepted_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Proposals (negotiation)
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id),
  proposed_price DECIMAL(10,2) NOT NULL,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- Ratings
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ride_id, from_user_id)
);

-- Payments
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id),
  payer_id UUID NOT NULL REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  driver_amount DECIMAL(10,2) NOT NULL,
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  abacatepay_id VARCHAR(255),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial indices (GiST)
CREATE INDEX idx_driver_locations_geo ON driver_locations USING GIST (location);
CREATE INDEX idx_rides_origin_geo ON rides USING GIST (origin_location);
CREATE INDEX idx_rides_destination_geo ON rides USING GIST (destination_location);

-- Performance indices
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_rides_status ON rides (status);
CREATE INDEX idx_rides_embarcador ON rides (embarcador_id);
CREATE INDEX idx_rides_driver ON rides (driver_id);
CREATE INDEX idx_proposals_ride ON proposals (ride_id);
CREATE INDEX idx_proposals_driver ON proposals (driver_id);
CREATE INDEX idx_driver_locations_available ON driver_locations (available) WHERE available = true;
CREATE INDEX idx_payments_ride ON payments (ride_id);
CREATE INDEX idx_ratings_to_user ON ratings (to_user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rides_updated_at BEFORE UPDATE ON rides FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_driver_locations_updated_at BEFORE UPDATE ON driver_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

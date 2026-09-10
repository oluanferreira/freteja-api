// User roles
export type UserRole = 'embarcador' | 'motorista' | 'admin';

// User status
export type UserStatus = 'pending' | 'approved' | 'active' | 'suspended' | 'blocked';

// Ride status
export type RideStatus =
  | 'pending'
  | 'accepted'
  | 'collecting'
  | 'in_transit'
  | 'delivering'
  | 'completed'
  | 'cancelled';

// Vehicle types
export type VehicleType = 'moto' | 'carro' | 'utilitario' | 'van' | 'caminhao';

// Payment
export type PaymentMethod = 'pix' | 'cartao' | 'dinheiro';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

// Proposal status
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

// Weight ranges
export type WeightRange = 'ate_50kg' | '50_200kg' | '200_500kg' | '500kg_1t' | 'acima_1t';

// Volume ranges
export type VolumeRange = 'porta_malas' | 'carroceria' | 'van' | 'caminhao';

// Base entity
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User
export interface User extends BaseEntity {
  email: string;
  phone: string;
  name: string;
  cpfCnpj: string | null;
  role: UserRole;
  status: UserStatus;
  avatarUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
}

// Vehicle
export interface Vehicle extends BaseEntity {
  driverId: string;
  type: VehicleType;
  brand: string;
  model: string;
  year: number;
  plate: string;
  color: string | null;
  capacityKg: number | null;
  photoUrls: string[];
  crlvUrl: string | null;
  active: boolean;
}

// Ride
export interface Ride extends BaseEntity {
  embarcadorId: string;
  driverId: string | null;
  status: RideStatus;
  originAddress: string;
  originLat: number;
  originLng: number;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  cargoDescription: string;
  cargoCategory: string | null;
  cargoPhotoUrls: string[];
  weightRange: WeightRange | null;
  volumeRange: VolumeRange | null;
  vehicleTypePreferred: VehicleType | null;
  notes: string | null;
  suggestedPrice: number;
  finalPrice: number | null;
  commissionRate: number;
  commissionAmount: number | null;
  scheduledAt: Date | null;
  scheduleWindowMinutes: number | null;
}

// Proposal
export interface Proposal extends BaseEntity {
  rideId: string;
  driverId: string;
  proposedPrice: number;
  message: string | null;
  status: ProposalStatus;
  respondedAt: Date | null;
}


export type WorkspaceCategory =
  | 'coworking'
  | 'private-office'
  | 'meeting-room'
  | 'event-space';

export interface Workspace {
  id: string;
  name: string;
  location: string;
  address: string;
  latitude: number;
  longitude: number;
  category: WorkspaceCategory;
  description: string;
  price: number;
  rating: number;
  reviewCount: number;
  image: string;
  amenities: string[];
  capacity: number;
  isVerified: boolean;
  isAvailable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

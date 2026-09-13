import type { Position, RouteDetail } from './types';

export type ServiceFilters = Readonly<Record<string, string[]>>;
export interface StationChoice {
  id: string;
  name: string;
  names: string[];
  position: Position;
  members: {
    routeId: string;
    stationId: string;
    stationName: string;
    routeName: string;
    operator: string;
    prefectures: string[];
  }[];
}
export interface JourneyLeg {
  routeId: string;
  fromStationId: string;
  toStationId: string;
  fromName: string;
  toName: string;
  geometry: RouteDetail['geometry'];
  meters?: number;
  departure?: string;
  arrival?: string;
}
export interface JourneyResult {
  status: 'available' | 'unavailable';
  kind?: 'distance' | 'time';
  message: string;
  legs?: JourneyLeg[];
  meters?: number;
  minutes?: number;
  arrival?: string;
}
export interface JourneyResponse {
  distance: JourneyResult;
  time: JourneyResult;
}
export interface JourneySelection {
  key: string;
  result: JourneyResult;
  stops: StationChoice[];
}

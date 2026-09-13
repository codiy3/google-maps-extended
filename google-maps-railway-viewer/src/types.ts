export type Position = [number, number];
export type StopState = 'common' | 'conditional' | 'observed' | 'unknown' | 'none';
export interface Station {
  id: string;
  name: string;
  position: Position;
  sourceCodes: string[];
}
export interface TrainService {
  id: string;
  name: string;
  rank: number | null;
  stops: Record<string, StopState>;
}
export interface RouteSummary {
  id: string;
  name: string;
  operator: string;
  officialOperator: string;
  operatorAliases: string[];
  prefectures: string[];
  regionStatus: 'complete' | 'partial' | 'unavailable';
  aliases: string[];
  kind: 'source_railway' | 'operating_service';
  section: string;
  stationOrder: 'name' | 'route';
  stationCount: number;
  stationNames: string[];
  dataDate: string;
  sources: { title: string; url: string }[];
  services: TrainService[];
  serviceStatus: 'available' | 'unavailable';
}
export interface RouteDetail extends RouteSummary {
  stations: Station[];
  geometry: { id: string; coordinates: Position[] }[];
}
export interface Catalog {
  schemaVersion: 2;
  dataDate: string;
  releaseReady: boolean;
  notice: string;
  routes: RouteSummary[];
}

export interface VehicleReport {
  vehicle: {
    reg: string;
    make: string;
    model: string;

    fuel?: string;
    colour?: string;

    year?: number| null;
    engineCapacity?: number| null;
    co2?: number| null;
    taxStatus?: string| null;
    motStatus?: string| null;
    exportStatus?: boolean| null;
  };

  finance: 'clear' | 'outstanding' | 'unknown';
  stolen: 'yes' | 'no' | 'unknown';
  writeOff: 'yes' | 'no' | 'unknown';

  riskScore: number;
  insights: string[];
}
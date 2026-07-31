declare module 'open-location-code' {
  export class OpenLocationCode {
    isValid(code: string): boolean;
    isFull(code: string): boolean;
    isShort(code: string): boolean;
    recoverNearest(code: string, referenceLatitude: number, referenceLongitude: number): string;
    decode(code: string): {
      latitudeLo: number;
      longitudeLo: number;
      latitudeHi: number;
      longitudeHi: number;
      latitudeCenter: number;
      longitudeCenter: number;
      codeLength: number;
    };
  }
}

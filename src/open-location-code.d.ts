declare module 'open-location-code' {
  export class OpenLocationCode {
    isValid(code: string): boolean;
    isFull(code: string): boolean;
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

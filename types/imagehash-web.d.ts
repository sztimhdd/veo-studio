// Mock declaration for imagehash-web since we don't have its types
declare module 'imagehash-web' {
  export const browser: {
    hash(data: string, bits: number, format: string): Promise<string>;
  };
}

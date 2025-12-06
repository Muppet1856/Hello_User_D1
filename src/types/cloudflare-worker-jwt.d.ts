declare module "@tsndr/cloudflare-worker-jwt" {
  interface SignOptions {
    header?: any;
    exp?: number;
  }

  export function sign(
    payload: object,
    secret: string | ArrayBuffer,
    options?: SignOptions
  ): Promise<string>;

  export function verify(
    token: string,
    secret: string | ArrayBuffer
  ): Promise<boolean>;

  export function decode(token: string): any;
}

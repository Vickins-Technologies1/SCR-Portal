declare module "qrcode" {
  type QRCodeErrorCorrectionLevel = "low" | "medium" | "quartile" | "high";

  interface QRCodeToDataURLOptions {
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    margin?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  const QRCode: {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  };

  export default QRCode;
}

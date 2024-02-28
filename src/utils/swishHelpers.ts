import fs from "fs";
import path from "path";
import https from "https";
import axios from "axios";
import { env } from "~/env.mjs";

const certPath = path.resolve(
  "./swishCerts/Swish_Merchant_TestCertificate_1234679304.pem"
);
const keyPath = path.resolve(
  "./swishCerts/Swish_Merchant_TestCertificate_1234679304.key"
);
const caPath = path.resolve("./ssl/Swish_TLS_RootCA.pem");

const swishAgent = new https.Agent({
  pfx: fs.readFileSync(process.cwd() + "/ssl/Swish_key.p12", { encoding: "utf8" }),
  passphrase: env.SWISH_PASSPHRASE,
});

export const swishClient = axios.create({
  httpsAgent: swishAgent
});

const SWISH_PATHS = {
  PAYMENT_REQUEST: `${env.SWISH_MERCHANT_BASEURL}/v2/paymentrequests`,
  REFUND_REQUEST: `${env.SWISH_MERCHANT_BASEURL}/v2/refunds`,
  PAYMENT_STATUS: `${env.SWISH_MERCHANT_BASEURL}/v1/paymentrequests`
};

/**
 * Swish only supports UUIDs without dashes and in uppercase.
 * @returns uppercase string without dashes
 */
const createSwishUUID = () => {
  return crypto.randomUUID().replaceAll("-", "").toUpperCase();
};

export interface PaymentRequest {
  amount: string | number;
  callbackUrl: string;
  currency: string;
  message?: string;
  payeeAlias: string;
  payeePaymentReference?: string;
  payerAlias?: string;
}

export const createPaymentRequest = (data: PaymentRequest) => {
  const instructionId = createSwishUUID();
  return swishClient.put(
    `${SWISH_PATHS.PAYMENT_REQUEST}/${instructionId}`,
    data
  );
};

export interface RefundRequest extends Omit<PaymentRequest, "payeeAlias"> {
  originalPaymentReference: string;
}

export const createRefundRequest = (data: RefundRequest) => {
  const instructionId = createSwishUUID();
  return swishClient.put(
    `${SWISH_PATHS.REFUND_REQUEST}/${instructionId}`,
    data
  );
};

export const getPaymentStatus = (id: string) => {
  return swishClient.get(`${SWISH_PATHS.PAYMENT_STATUS}/${id}`);
};

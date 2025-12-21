import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 S3-Compatible Client
 */

const getR2Config = () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing R2 configuration environment variables");
    }
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
};

const config = getR2Config();

export const r2Client = config
  ? new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  : null;

export const BUCKET_NAME = config?.bucketName || "";

/**
 * Uploads a file to R2
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string,
) {
  if (!r2Client) {
    throw new Error("R2 client not initialized. Check your .env file.");
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  return await r2Client.send(command);
}

/**
 * Gets a file from R2
 */
export async function getFromR2(key: string) {
  if (!r2Client) {
    throw new Error("R2 client not initialized. Check your .env file.");
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);
  return response;
}

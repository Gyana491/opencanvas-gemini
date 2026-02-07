import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";

dotenv.config();

// Configuration from your environment variables
const r2Config = {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: "opencanvas",
};

if (!r2Config.accountId || !r2Config.accessKeyId || !r2Config.secretAccessKey) {
    console.error("Error: Missing R2 environment variables in .env file.");
    process.exit(1);
}

const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
});

async function checkConnection() {
    console.log(`Checking connection to bucket: ${r2Config.bucketName}...`);

    try {
        const command = new ListObjectsV2Command({
            Bucket: r2Config.bucketName,
            MaxKeys: 1,
        });

        const response = await S3.send(command);
        console.log("Success! Connection established.");
        console.log("Bucket status: Accessible");

    } catch (error) {
        console.error("Connection failed!");
        console.error(`Error: ${error}`);
    }
}

checkConnection();
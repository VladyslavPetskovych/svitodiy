import { createClient } from "redis";

/** @type {import("redis").RedisClientType | null} */
let client = null;

export async function connectRedis() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  client = createClient({ url });
  client.on("error", (err) => console.error("[redis]", err.message));
  await client.connect();
  console.log("[redis] connected", url.replace(/:[^:@/]+@/, ":****@"));
}

export function getRedis() {
  if (!client?.isOpen) {
    throw new Error("Redis is not connected. Call connectRedis() first.");
  }
  return client;
}

export async function disconnectRedis() {
  if (client?.isOpen) {
    await client.quit();
    console.log("[redis] disconnected");
  }
  client = null;
}

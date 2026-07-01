import "dotenv/config";
import { buildApp } from "./app.js";
import { env } from "./lib/env.js";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: "::1" });
    console.log(`🚀 Pulso API rodando na porta ${env.PORT} [${env.NODE_ENV}]`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

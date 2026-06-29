import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { env } from "./lib/env.js";
import { errorHandler } from "./plugins/error-handler.js";
import { authenticatePlugin } from "./shared/middleware/authenticate.js";
import { socketPlugin } from "./plugins/socket.js";
import { startDeadlineJob } from "./jobs/deadline.job.js";
import { startStatsJob } from "./jobs/stats.job.js";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { organizationRoutes } from "./modules/organization/organization.routes.js";
import { meRoutes } from "./modules/organization/me.routes.js";
import { notificationRoutes } from "./modules/organization/notification.routes.js";
import { pushRoutes } from "./modules/organization/push.routes.js";
import { statsRoutes } from "./modules/organization/stats.routes.js";
import { profileRoutes } from "./modules/organization/profile.routes.js";
import { scheduleRoutes } from "./modules/schedule/schedule.routes.js";
import { swapRoutes } from "./modules/swap/swap.routes.js";
import { songRoutes } from "./modules/song/song.routes.js";
import { techCheckRoutes } from "./modules/tech-check/tech-check.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "test" ? "silent" : "info" },
  });

  // ── segurança
  await app.register(helmet);
  await app.register(cors, { origin: env.FRONTEND_URL, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: "token", signed: false },
  });

  // ── plugins internos
  await app.register(authenticatePlugin);
  await app.register(socketPlugin);
  await errorHandler(app);

  // ── health check
  app.get("/health", async () => ({ status: "ok", env: env.NODE_ENV }));

  // ── auth
  await app.register(authRoutes, { prefix: "/auth" });

  // ── rotas sem prefix de org (usuário, push)
  await app.register(pushRoutes);
  await app.register(meRoutes);

  // ── módulos escopados por organização
  await app.register(organizationRoutes, { prefix: "/organizations" });
  await app.register(notificationRoutes, { prefix: "/organizations" });
  await app.register(statsRoutes, { prefix: "/organizations" });
  await app.register(profileRoutes, { prefix: "/organizations" });
  await app.register(scheduleRoutes, { prefix: "/organizations" });
  await app.register(swapRoutes, { prefix: "/organizations" });
  await app.register(songRoutes, { prefix: "/organizations" });
  await app.register(techCheckRoutes, { prefix: "/organizations" });

  // ── cron jobs (não roda em ambiente de teste)
  if (env.NODE_ENV !== "test") {
    startDeadlineJob();
    startStatsJob();
  }

  return app;
}

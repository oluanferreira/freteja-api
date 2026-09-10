import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (app) return app;
  const { buildServer } = await import("../src/server");
  app = await buildServer();
  await app.ready();
  return app;
}

function stripApiPrefix(url: string): string {
  // /api/[[...route]] receives /api/* — Fastify routes are registered as /api/* already.
  return url || "/";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const server = await getApp();
    const rawUrl = typeof req.url === "string" ? req.url : "/";
    const [pathname, search] = rawUrl.split("?");
    const body =
      req.body !== undefined && req.body !== null && req.body !== ""
        ? typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body)
        : undefined;
    const response = await server.inject({
      method: (req.method || "GET") as "GET",
      url: stripApiPrefix(pathname) + (search ? `?${search}` : ""),
      headers: req.headers as Record<string, string>,
      payload: body,
    });
    res.status(response.statusCode);
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) res.setHeader(key, value as string | string[]);
    }
    res.send(response.rawBody ?? response.body);
  } catch (err) {
    res.status(500).json({ statusCode: 500, error: "boot_failed" });
  }
}

export const config = { maxDuration: 60 };

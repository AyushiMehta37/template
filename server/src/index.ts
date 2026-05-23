import "dotenv/config";
import express from "express";
import { aiRouter } from "./routes/ai.ts";
import { templateRouter } from "./routes/template.ts";

const app = express();
app.use(express.json({ limit: "256kb" }));

app.use("/api/template", templateRouter);
app.use("/api/ai", aiRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Defensive error handler so a thrown error in any route returns JSON instead of HTML.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[server] unhandled error:", message);
    res.status(500).json({ ok: false, error: message });
  },
);

const port = Number(process.env.SERVER_PORT) || 3001;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[server] OPENAI_API_KEY not set — AI endpoints will fail. Copy .env.example to .env and set the key.",
    );
  }
});

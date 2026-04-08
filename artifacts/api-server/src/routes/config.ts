import { Router, type IRouter, type Request, type Response } from "express";
import { getConfig, updateConfig, createAdminToken, validateAdminToken, revokeAdminToken } from "../lib/config.js";
import { fetchCredits, buildCreditsJson } from "../lib/credits.js";
import { syncAllModels, getSyncCache } from "../lib/model-sync.js";
import { getUsageSummary } from "../lib/usage-log.js";

const router: IRouter = Router();

router.post("/config/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const cfg = getConfig();
  if (!password || password !== cfg.portalPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = createAdminToken();
  const envKeySet = !!(process.env.OPENAI_DIRECT_KEY?.trim());
  res.json({
    token,
    proxyApiKey: cfg.proxyApiKey,
    openaiDirectKeySet: envKeySet || !!(cfg.openaiDirectKey?.trim()),
    openaiDirectKeyFromEnv: envKeySet,
  });
});

router.post("/config/logout", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    revokeAdminToken(auth.slice(7));
  }
  res.json({ ok: true });
});

router.get("/config/settings", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const cfg = getConfig();
  const envKeySet = !!(process.env.OPENAI_DIRECT_KEY?.trim());
  res.json({
    proxyApiKey: cfg.proxyApiKey,
    openaiDirectKeySet: envKeySet || !!(cfg.openaiDirectKey?.trim()),
    openaiDirectKeyFromEnv: envKeySet,
  });
});

router.post("/config/settings", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { proxyApiKey, portalPassword, openaiDirectKey } = req.body as {
    proxyApiKey?: string; portalPassword?: string; openaiDirectKey?: string;
  };
  const updates: Partial<{ proxyApiKey: string; portalPassword: string; openaiDirectKey: string }> = {};
  if (proxyApiKey && proxyApiKey.trim()) updates.proxyApiKey = proxyApiKey.trim();
  if (portalPassword && portalPassword.trim()) updates.portalPassword = portalPassword.trim();
  if (openaiDirectKey !== undefined) updates.openaiDirectKey = openaiDirectKey.trim();
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const cfg = updateConfig(updates);
  const envKeySet = !!(process.env.OPENAI_DIRECT_KEY?.trim());
  res.json({
    ok: true,
    proxyApiKey: cfg.proxyApiKey,
    openaiDirectKeySet: envKeySet || !!(cfg.openaiDirectKey?.trim()),
    openaiDirectKeyFromEnv: envKeySet,
  });
});

router.post("/sync-models", async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const cache = await syncAllModels();
    res.json({
      ok: true,
      syncedAt: cache.syncedAt,
      results: cache.results.map((r) => ({
        provider: r.provider,
        ok: r.ok,
        source: r.source,
        count: r.models.length,
        error: r.error,
        models: r.models,
      })),
    });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

router.get("/sync-models", async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let cache = getSyncCache();
  if (!cache) {
    try {
      cache = await syncAllModels();
    } catch (e: unknown) {
      res.status(500).json({ ok: false, error: String(e) });
      return;
    }
  }
  res.json({
    ok: true,
    synced: true,
    syncedAt: cache.syncedAt,
    results: cache.results.map((r) => ({
      provider: r.provider,
      ok: r.ok,
      source: r.source,
      count: r.models.length,
      error: r.error,
      models: r.models,
    })),
  });
});

router.get("/credits", async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await fetchCredits();
  if (result.needsKey) {
    res.json({ needs_key: true, error: result.error });
    return;
  }
  if (!result.ok) {
    res.status(503).json({ error: result.error ?? "Credits unavailable" });
    return;
  }
  res.json(buildCreditsJson(result));
});

router.get("/usage", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1000);
  res.json(getUsageSummary(limit));
});

export default router;

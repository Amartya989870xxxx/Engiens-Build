import { describe, it, expect } from "vitest";
import { createApp } from "../../src/app.js";
import request from "supertest";

const testConfig = {
  tinyfishApiKey: "test-tf-key",
  geminiApiKey: "test-gemini-key",
  geminiModel: "gemini-3.8-flash",
  githubToken: undefined,
  githubAppId: undefined,
  githubInstallationId: undefined,
  githubPrivateKeyPath: undefined,
  groqApiKey: undefined,
  port: 8787,
  nodeEnv: "test",
};

describe("App Routes & Validation", () => {
  const app = createApp(testConfig);

  it("GET /api/health returns server status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.services.tinyfish.configured).toBe(true);
    expect(res.body.services.gemini.configured).toBe(true);
  });

  it("POST /api/repositories/inspect rejects missing repoUrl", async () => {
    const res = await request(app).post("/api/repositories/inspect").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("POST /api/build/plan rejects short request description", async () => {
    const res = await request(app)
      .post("/api/build/plan")
      .send({ repoUrl: "https://github.com/expressjs/express", request: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });
});

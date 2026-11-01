import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { DexorIntelligenceRouter } from "../../src/services/intelligenceRouter.js";
import type { AppConfig } from "../../src/config/env.js";

const testConfig: AppConfig = {
  tinyfishApiKey: "tf-test",
  geminiApiKey: "gemini-test",
  geminiModel: "gemini-3.8-flash",
  groqApiKey: "gsk-test",
  githubToken: undefined,
  githubAppId: undefined,
  githubInstallationId: undefined,
  githubPrivateKeyPath: undefined,
  port: 8787,
  nodeEnv: "test",
};

describe("Companion API Endpoints", () => {
  const app = createApp(testConfig);

  it("POST /api/companion/chat rejects empty message", async () => {
    const res = await request(app).post("/api/companion/chat").send({ message: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("POST /api/companion/chat returns AI answer with metadata", async () => {
    vi.spyOn(DexorIntelligenceRouter, "executeText").mockResolvedValueOnce({
      text: "To integrate Razorpay, install `razorpay` package and initialize with Key ID and Secret.",
      provider: "gemini",
      model: "gemini-3.8-flash",
      fallbackOccurred: false,
      failedAttempts: 0,
      durationMs: 120,
    });

    const res = await request(app)
      .post("/api/companion/chat")
      .send({
        message: "How do I integrate this?",
        pageContext: {
          url: "https://razorpay.com/docs/payments/payment-gateway/node-js/",
          title: "Razorpay Node.js Integration Docs",
          domain: "razorpay.com",
          pageContent: "Razorpay Node.js SDK allows developers to integrate payments seamlessly.",
        },
        triggerResearch: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.reply).toContain("Razorpay");
    expect(res.body.model).toBe("gemini-3.8-flash");
    expect(res.body.provider).toBe("gemini");
    expect(res.body.id).toBeDefined();
  });

  it("POST /api/companion/work returns structured recommendation", async () => {
    vi.spyOn(DexorIntelligenceRouter, "executeJson").mockResolvedValueOnce({
      data: {
        taskSummary: "Integrate payment gateway into Express app",
        architectureAlignment: {
          stackSummary: "Node.js Express application",
          detectedTechnologies: ["Express"],
          architecturePattern: "MVC",
        },
        implementationApproach: {
          overview: "Create order endpoint and webhook listener",
          steps: [{ title: "Setup SDK", description: "Initialize client", relevantFiles: ["config/razorpay.js"] }],
        },
        targetFiles: [{ path: "config/razorpay.js", action: "create", reason: "Initialize credentials" }],
        codeSnippet: {
          language: "javascript",
          description: "Razorpay initialization",
          code: "const Razorpay = require('razorpay');",
        },
        testingStrategy: ["Verify order creation returns id"],
        risksAndSecurity: ["Never expose key_secret to frontend"],
      },
      provider: "gemini",
      model: "gemini-3.8-flash",
      fallbackOccurred: false,
      failedAttempts: 0,
      durationMs: 250,
    });

    const res = await request(app)
      .post("/api/companion/work")
      .send({
        task: "Integrate Razorpay into my backend application",
        pageContext: {
          url: "https://razorpay.com/docs",
          title: "Razorpay Docs",
          domain: "razorpay.com",
          pageContent: "Razorpay documentation content...",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.recommendation.taskSummary).toBe("Integrate payment gateway into Express app");
    expect(res.body.workspaceContinuationUrl).toContain("http://localhost:5173");
  });
});

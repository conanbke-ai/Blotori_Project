import assert from "node:assert/strict";
import { once } from "node:events";
import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";

// Run from Blotori's repository root or pass the repository directory as argv[2].
const repository = realpathSync(process.argv[2] ?? process.cwd());
const requireProduct = createRequire(join(repository, "package.json"));
const { OpenAI, APIConnectionTimeoutError } = requireProduct("openai");
const { VERSION: sdkVersion } = requireProduct("openai/version");
const credentials = "fixture-key-never-transmitted-externally";
const requestBody = { model: "fixture-model", input: "합성 테스트 요청" };
const endpointPath = "/v1/responses";
const loopback = "127.0.0.1";

function replyError(response, status, retryAfter) {
  const headers = { "content-type": "application/json" };
  if (retryAfter !== undefined) headers["retry-after"] = String(retryAfter);
  response.writeHead(status, headers);
  response.end(JSON.stringify({ error: { message: "Synthetic fixture response" } }));
}

function replySuccess(response) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    id: "resp_fixture",
    object: "response",
    created_at: 1,
    status: "completed",
    output: [],
  }));
}

async function exercise({ name, expectedRequests, handle, clientOptions, expectedError }) {
  const received = [];
  const errors = [];
  let blockedFetches = 0;
  let calls = 0;
  let successfulResponses = 0;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, "POST");
      assert.equal(request.url, endpointPath);
      assert.equal(request.headers.authorization, `Bearer ${credentials}`);
      const body = [];
      for await (const chunk of request) body.push(chunk);
      assert.deepEqual(JSON.parse(Buffer.concat(body).toString("utf8")), requestBody);
      received.push({
        retryCount: Number(request.headers["x-stainless-retry-count"]),
        hasIdempotencyKey: "idempotency-key" in request.headers,
      });
      handle(request, response, received.length);
    } catch (error) {
      errors.push(error);
      if (!response.destroyed && !response.headersSent) replyError(response, 400);
    }
  });
  server.listen(0, loopback);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://${loopback}:${address.port}`;
  const allowedUrl = `${origin}${endpointPath}`;

  try {
    const client = new OpenAI({
      apiKey: credentials,
      baseURL: `${origin}/v1`,
      fetch: (input, init) => {
        const target = input instanceof Request ? input.url : String(input);
        if (target !== allowedUrl) {
          blockedFetches += 1;
          throw new Error("Fixture permits only its loopback Responses endpoint");
        }
        return fetch(input, { ...init, redirect: "error" });
      },
      ...clientOptions,
    });
    assert.equal(client.maxRetries, clientOptions?.maxRetries ?? 2);
    assert.equal(client.timeout, clientOptions?.timeout ?? 600_000);

    // The application starts one SDK operation. The server counts its HTTP attempts.
    calls += 1;
    const operation = client.responses.create(requestBody);
    if (expectedError) {
      await assert.rejects(operation, expectedError);
    } else {
      const response = await operation;
      assert.equal(response.id, "resp_fixture");
      successfulResponses += 1;
    }
    assert.equal(calls, 1);
    assert.deepEqual(errors, []);
    assert.equal(blockedFetches, 0);
    assert.equal(received.length, expectedRequests);
    assert.deepEqual(received.map(({ retryCount }) => retryCount), Array.from(
      { length: expectedRequests }, (_, attempt) => attempt,
    ));
    assert.ok(received.every(({ hasIdempotencyKey }) => !hasIdempotencyKey));
    return {
      name,
      logicalSdkCalls: calls,
      receivedHttpRequests: received.length,
      successfulResponses,
      blockedFetches,
      hasIdempotencyKey: false,
    };
  } finally {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server.closeAllConnections();
    await closed;
  }
}

const fixtures = [
  {
    name: "503 retries exhausted",
    expectedRequests: 3,
    handle: (_request, response) => replyError(response, 503, 0),
    expectedError: { status: 503 },
  },
  {
    name: "429 Retry-After zero then success",
    expectedRequests: 3,
    handle: (_request, response, attempt) => {
      if (attempt < 3) replyError(response, 429, 0);
      else replySuccess(response);
    },
  },
  {
    name: "400 terminal error",
    expectedRequests: 1,
    handle: (_request, response) => replyError(response, 400),
    expectedError: { status: 400 },
  },
  {
    name: "connection reset after receipt then success",
    expectedRequests: 2,
    handle: (request, response, attempt) => {
      if (attempt === 1) request.socket.destroy();
      else replySuccess(response);
    },
  },
  {
    name: "timeout after receipt with default retry count",
    expectedRequests: 3,
    clientOptions: { timeout: 500 },
    // The server already received the complete body. Withhold the response to
    // demonstrate why a timeout cannot determine whether execution happened.
    handle: () => {},
    expectedError: APIConnectionTimeoutError,
  },
  {
    name: "timeout after receipt with fixture-only retry opt-out",
    expectedRequests: 1,
    clientOptions: { timeout: 500, maxRetries: 0 },
    handle: () => {},
    expectedError: APIConnectionTimeoutError,
  },
];

const outcomes = [];
for (const fixture of fixtures) outcomes.push(await exercise(fixture));
console.log(JSON.stringify({
  result: "SDK_TRANSPORT_PASS",
  sdkVersion,
  sdkDefaults: { maxRetries: 2, timeoutMs: 600_000 },
  outcomes,
  externalRequests: 0,
}));

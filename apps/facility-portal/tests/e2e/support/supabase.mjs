import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const { hostname, port } = new URL(process.env.FACILITY_E2E_BACKEND_URL);

const secret = randomBytes(32);

const scenarios = new Map();

function createSession(id, email) {
  const now = Math.floor(Date.now() / 1000);
  const expires_at = now + 3600;
  const user = {
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const claims = {
    sub: id,
    aud: user.aud,
    role: user.role,
    iat: now,
    exp: expires_at,
  };
  const unsigned = [{ alg: "HS256", typ: "JWT" }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  const signature = createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64url");
  return {
    access_token: `${unsigned}.${signature}`,
    refresh_token: randomBytes(24).toString("hex"),
    token_type: "bearer",
    expires_in: 3600,
    expires_at,
    user,
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

const server = createServer(async (request, response) => {
  const { pathname, searchParams } = new URL(request.url, "http://localhost");
  const send = (body, status = 200) => {
    response.writeHead(status, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        request.headers["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "content-type": "application/json",
    });
    response.end(status === 204 ? undefined : JSON.stringify(body));
  };

  try {
    if (request.method === "OPTIONS") return send(null, 204);
    if (pathname === "/health") return send({ ok: true });

    if (pathname.startsWith("/fixtures/")) {
      const id = pathname.slice("/fixtures/".length);
      if (request.method === "POST") {
        const { email, responses } = await readJson(request);
        const session = createSession(id, email);
        scenarios.set(id, { session, responses, calls: [] });
        return send(null, 201);
      }
      if (request.method === "DELETE") {
        scenarios.delete(id);
        return send(null, 204);
      }
      return send(scenarios.get(id)?.calls ?? []);
    }

    if (
      pathname === "/auth/v1/token" &&
      searchParams.get("grant_type") === "password"
    ) {
      const { email, password } = await readJson(request);
      const scenario = [...scenarios.values()].find(
        (item) => item.session.user.email === email
      );
      if (!scenario || password !== "fixture-password") {
        return send(
          { code: "invalid_credentials", msg: "Invalid login credentials" },
          400
        );
      }
      return send(scenario.session);
    }

    const authorization = request.headers.authorization;
    const scenario = [...scenarios.values()].find(
      (item) => authorization === `Bearer ${item.session.access_token}`
    );
    if (!scenario) return send({ message: "Fixture session required" }, 401);
    if (pathname === "/auth/v1/user") return send(scenario.session.user);
    if (pathname === "/auth/v1/logout") return send(null, 204);

    const storagePrefix = "/storage/v1/object/facility-evidence/";
    if (request.method === "POST" && pathname.startsWith(storagePrefix)) {
      const path = decodeURIComponent(pathname.slice(storagePrefix.length));
      for await (const chunk of request) void chunk;
      scenario.calls.push({ name: "upload_facility_evidence", args: { path } });
      return send({ Key: `facility-evidence/${path}` });
    }

    const name = pathname.replace(/^\/rest\/v1\/rpc\//, "");
    const call = {
      name,
      args:
        request.method === "GET"
          ? Object.fromEntries(searchParams)
          : await readJson(request),
    };
    scenario.calls.push(call);
    const stub = scenario.responses[name];
    if (!stub) return send({ message: `Missing fixture for ${name}` }, 404);

    Object.assign(scenario.responses, stub.after);
    return send(stub.body, stub.status);
  } catch (error) {
    console.error(error);
    return send({ message: "Fixture server error" }, 500);
  }
});

server.listen(Number(port), hostname);

import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "~/app/api/proxy/route";
import { server } from "../mocks/server";

const TEXTURE_URL = "https://api.vastrasidan.se/wp-content/uploads/kort.glb";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);

let upstreamRequests: Request[] = [];

const recordRequest = ({ request }: { request: Request }) => {
  upstreamRequests.push(request);
};

beforeEach(() => {
  upstreamRequests = [];
  server.events.on("request:start", recordRequest);
  return () => server.events.removeListener("request:start", recordRequest);
});

const proxy = (target: string, headers: HeadersInit = {}) =>
  GET(
    new Request(`http://localhost:3000/api/proxy?url=${encodeURIComponent(target)}`, { headers })
  );

describe("proxy", () => {
  it("serves a member card texture with only safe headers", async () => {
    server.use(
      http.get(TEXTURE_URL, () =>
        HttpResponse.arrayBuffer(GLB.buffer, {
          headers: {
            "content-type": "model/gltf-binary",
            "content-length": String(GLB.byteLength),
            "set-cookie": "upstream=1",
            "access-control-allow-origin": "*"
          }
        })
      )
    );

    const res = await proxy(TEXTURE_URL);

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(GLB);
    expect(Object.fromEntries(res.headers)).toEqual({
      "content-type": "model/gltf-binary",
      "content-length": String(GLB.byteLength),
      "content-disposition": "attachment",
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable"
    });
  });

  it.each([
    ["a look-alike domain", "https://www.vastrasidan.se.evil.com/kort.glb"],
    ["userinfo before another host", "https://api.vastrasidan.se@evil.com/kort.glb"],
    ["userinfo on an allowed host", "https://user:pass@api.vastrasidan.se/kort.glb"],
    ["plain http", "http://api.vastrasidan.se/kort.glb"],
    ["another port", "https://api.vastrasidan.se:8443/kort.glb"],
    ["a sub-domain", "https://evil.api.vastrasidan.se/kort.glb"],
    ["the allowed origin in the query", "https://evil.com/?https://api.vastrasidan.se"],
    ["a javascript: url", "javascript:alert(document.cookie)"],
    ["something that isn't a url", "api.vastrasidan.se/kort.glb"]
  ])("rejects %s", async (_, target) => {
    const res = await proxy(target);

    expect(res.status).toBe(400);
    expect(upstreamRequests).toEqual([]);
  });

  it("does not forward the visitor's cookies or headers", async () => {
    server.use(http.get(TEXTURE_URL, () => HttpResponse.arrayBuffer(GLB.buffer)));

    await proxy(TEXTURE_URL, {
      cookie: "next-auth.session-token=secret",
      authorization: "Bearer secret",
      "x-forwarded-for": "1.2.3.4"
    });

    const [upstream] = upstreamRequests;
    expect(upstream?.headers.get("cookie")).toBeNull();
    expect(upstream?.headers.get("authorization")).toBeNull();
    expect(upstream?.headers.get("x-forwarded-for")).toBeNull();
  });

  it("never serves upstream HTML as HTML", async () => {
    server.use(
      http.get(TEXTURE_URL, () => HttpResponse.html("<script>alert(document.cookie)</script>"))
    );

    const res = await proxy(TEXTURE_URL);

    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe("attachment");
  });

  it("follows a redirect to another allowed host", async () => {
    const moved = "https://www.vastrasidan.se/wp-content/uploads/kort.glb";
    server.use(
      http.get(TEXTURE_URL, () => new HttpResponse(null, { status: 301, headers: { location: moved } })),
      http.get(moved, () =>
        HttpResponse.arrayBuffer(GLB.buffer, { headers: { "content-type": "model/gltf-binary" } })
      )
    );

    const res = await proxy(TEXTURE_URL);

    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(GLB);
  });

  it("does not follow a redirect off the allowlist", async () => {
    server.use(
      http.get(
        TEXTURE_URL,
        () => new HttpResponse(null, { status: 302, headers: { location: "https://evil.com/x" } })
      )
    );

    const res = await proxy(TEXTURE_URL);

    expect(res.status).toBe(502);
    expect(upstreamRequests.map((r) => new URL(r.url).hostname)).toEqual(["api.vastrasidan.se"]);
  });
});

import { describe, it, expect } from "vitest";
import {
  detect,
  domain,
  githubHandle,
  encrypt,
  decrypt,
} from "../src/security";
describe("hosted input security", () => {
  it("detects supported categories", () => {
    expect(detect("alice")).toBe("username");
    expect(detect("a@example.com")).toBe("email");
    expect(detect("+442079460018")).toBe("phone");
    expect(detect("example.com")).toBe("website");
  });
  it.each([
    "localhost",
    "http://127.0.0.1",
    "http://user:pass@example.com",
    "http://example.com:81",
    "file:///etc/passwd",
    "internal.lan",
    "something.local",
    "x;id",
  ])("rejects unsafe target %s", (value) =>
    expect(() => domain(value)).toThrow(),
  );
  it("only accepts supported public account URLs", () => {
    expect(githubHandle("https://github.com/octocat")).toBe("octocat");
    expect(githubHandle("https://github.com.evil.test/octocat")).toBeNull();
    expect(githubHandle("https://github.com/a/b")).toBeNull();
  });
  it("encrypts and authenticates provider credentials", async () => {
    const key = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    );
    const encrypted = await encrypt("a-private-key", key);
    expect(encrypted).not.toContain("a-private-key");
    expect(await decrypt(encrypted, key)).toBe("a-private-key");
    const wrong = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    );
    await expect(decrypt(encrypted, wrong)).rejects.toThrow();
  });
});

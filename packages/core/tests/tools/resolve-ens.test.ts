import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveEns, resolveEnsBatch } from "../../src/tools/resolve-ens.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// The ENS cache is module-level with a 1h TTL, so every test uses fresh addresses.
const NAMED = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
const UNNAMED = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2";
const BATCH_NAMED = "0xcccccccccccccccccccccccccccccccccccccc03";
const BATCH_UNNAMED = "0xdddddddddddddddddddddddddddddddddddddd04";

function ensideasResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("resolveEns", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the ENS name when the address has one", async () => {
    mockFetch.mockResolvedValueOnce(
      ensideasResponse({ displayName: "vitalik.eth", name: "vitalik.eth", avatar: "ipfs://x" })
    );

    const result = await resolveEns({ address: NAMED });

    expect(result.name).toBe("vitalik.eth");
    expect(result.displayName).toBe("vitalik.eth");
    expect(result.avatar).toBe("ipfs://x");
    expect(result.address).toBe(NAMED);
  });

  it("returns name=null when the provider only echoes a shortened address", async () => {
    // ensideas returns displayName = shortened address when there is no ENS name
    mockFetch.mockResolvedValueOnce(
      ensideasResponse({ displayName: "0xbbbb...bbb2", name: null, avatar: null })
    );

    const result = await resolveEns({ address: UNNAMED });

    expect(result.name).toBeNull();
    expect(result.displayName).toBe("0xbbbb...bbb2");
    expect(result.displayName).not.toBe(result.name);
  });

  it("does not treat an invalid address as resolvable", async () => {
    const result = await resolveEns({ address: "not-an-address" });

    expect(result.name).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("resolveEnsBatch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("counts only addresses with a real ENS name as resolved", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes(BATCH_NAMED)) {
        return ensideasResponse({ displayName: "gnars.eth", name: "gnars.eth", avatar: null });
      }
      return ensideasResponse({ displayName: "0xdddd...dd04", name: null, avatar: null });
    });

    const result = await resolveEnsBatch({
      addresses: [BATCH_NAMED, BATCH_UNNAMED],
      format: "json",
    });

    expect(result.total).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.results[BATCH_NAMED]!.name).toBe("gnars.eth");
    expect(result.results[BATCH_UNNAMED]!.name).toBeNull();
    expect(result.results[BATCH_UNNAMED]!.displayName).toBe("0xdddd...dd04");
  });
});

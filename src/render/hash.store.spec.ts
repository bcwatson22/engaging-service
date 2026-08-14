import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { createConnection } from "../redis/connection";
import { HashStore, prefix } from "./hash.store";

vi.mock("../redis/connection", () => ({
  createConnection: vi.fn<(url: string) => unknown>(),
}));

const url = "redis://127.0.0.1:6379";
const key = "billy-watson-cv.pdf";

const setup = async (options: { stored?: string | null } = {}) => {
  const get = vi
    .fn<() => Promise<string | null>>()
    .mockResolvedValue(options.stored ?? null);
  const set = vi.fn<() => Promise<"OK">>().mockResolvedValue("OK");
  const quit = vi.fn<() => Promise<"OK">>().mockResolvedValue("OK");

  vi.mocked(createConnection).mockReturnValue({
    get,
    set,
    quit,
  } as never);

  const module = await Test.createTestingModule({
    providers: [
      HashStore,
      { provide: ConfigService, useValue: { get: () => url } },
    ],
  }).compile();

  return { store: module.get(HashStore), get, set, quit };
};

describe("HashStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("connects through the shared factory, so it gets the same resilience settings", async () => {
    await setup();

    expect(createConnection).toHaveBeenNthCalledWith(1, url);
  });

  it("returns null when nothing has been rendered yet", async () => {
    const { store } = await setup();

    await expect(store.get(key)).resolves.toBeNull();
  });

  it("returns the stored hash", async () => {
    const { store } = await setup({ stored: "abc123" });

    await expect(store.get(key)).resolves.toBe("abc123");
  });

  it("namespaces keys so the queue's own keys cannot collide", async () => {
    const { store, set } = await setup();

    await store.set(key, "abc123");

    expect(set).toHaveBeenNthCalledWith(1, `${prefix}:${key}`, "abc123");
  });

  it("closes the connection on shutdown", async () => {
    const { store, quit } = await setup();

    await store.onModuleDestroy();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});

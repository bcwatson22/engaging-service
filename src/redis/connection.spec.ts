import IORedis from "ioredis";

import { connectionOptions, createConnection, timedOut } from "./connection";

vi.mock("ioredis", () => ({ default: vi.fn<(url: string) => unknown>() }));

const url = "rediss://default:secret@example.upstash.io:6379";

const setup = () => {
  const on = vi.fn<(event: string, handler: unknown) => unknown>();

  (IORedis as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    function () {
      return { on };
    },
  );

  return { client: createConnection(url), on };
};

describe("createConnection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dials the configured url", () => {
    setup();

    expect(IORedis).toHaveBeenNthCalledWith(1, url, connectionOptions);
  });

  it("attaches an error listener, without which node reports the event as unhandled", () => {
    const { on } = setup();

    expect(on).toHaveBeenNthCalledWith(1, "error", expect.any(Function));
  });

  it("swallows connection errors rather than rethrowing, since ioredis reconnects itself", () => {
    const { on } = setup();
    const [, handler] = on.mock.calls[0] as [string, (error: Error) => void];

    expect(() => handler(new Error("read ETIMEDOUT"))).not.toThrow();
  });
});

describe("connectionOptions", () => {
  it("lets blocking reads wait indefinitely, as BullMQ requires", () => {
    expect(connectionOptions.maxRetriesPerRequest).toBeNull();
  });

  it("reconnects after the read timeout a slept connection produces", () => {
    expect(
      connectionOptions.reconnectOnError(new Error(`read ${timedOut}`)),
    ).toBe(true);
  });

  it("leaves other errors to ioredis's normal handling", () => {
    expect(connectionOptions.reconnectOnError(new Error("WRONGPASS"))).toBe(
      false,
    );
  });

  it("does not force tls, so a local docker redis still connects", () => {
    expect(connectionOptions).not.toHaveProperty("tls");
  });
});

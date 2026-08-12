import { defaultPort, invalidMessage, validate } from "./env.schema";

const setup =
  (config: Record<string, unknown> = {}) =>
  () =>
    validate(config);

describe("validate", () => {
  it("applies defaults when nothing is supplied", () => {
    expect(setup()()).toEqual({
      NODE_ENV: "development",
      PORT: defaultPort,
    });
  });

  it("coerces a numeric port from its string environment value", () => {
    expect(setup({ PORT: "8080" })().PORT).toBe(8080);
  });

  it("keeps a recognised environment", () => {
    expect(setup({ NODE_ENV: "production" })().NODE_ENV).toBe("production");
  });

  it("throws when the environment is not recognised", () => {
    expect(setup({ NODE_ENV: "staging" })).toThrow(invalidMessage);
  });

  it("throws when the port is not a positive integer", () => {
    expect(setup({ PORT: "-1" })).toThrow(invalidMessage);
  });

  it("names the offending variable in the message", () => {
    expect(setup({ PORT: "nonsense" })).toThrow(/PORT —/);
  });

  it("labels a root-level failure when the config is not an object", () => {
    expect(setup("nonsense" as unknown as Record<string, unknown>)).toThrow(
      /\(root\) —/,
    );
  });
});

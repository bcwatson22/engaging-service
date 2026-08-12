import { z } from "zod";

const environments = ["development", "production", "test"] as const;

const defaultPort = 3000;

const envSchema = z.object({
  NODE_ENV: z.enum(environments).default("development"),
  PORT: z.coerce.number().int().positive().default(defaultPort),
});

type TEnv = z.infer<typeof envSchema>;

const invalidMessage = "Invalid environment configuration:";

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map(({ path, message }) => `${path.join(".") || "(root)"} — ${message}`)
    .join("; ");

/* Runs once at boot via ConfigModule, so a missing or malformed variable
   fails the deploy rather than the first request that happens to need it. */
const validate = (config: Record<string, unknown>): TEnv => {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`${invalidMessage} ${formatIssues(result.error)}`);
  }

  return result.data;
};

export { envSchema, validate, invalidMessage, defaultPort };
export type { TEnv };

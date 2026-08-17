import { z } from 'zod';

const environments = ['development', 'production', 'test'] as const;

const defaultPort = 3000;

const envSchema = z.object({
  NODE_ENV: z.enum(environments).default('development'),
  PORT: z.coerce.number().int().positive().default(defaultPort),

  /* The deployed site the renderer navigates to. No trailing slash — paths
     are appended directly. */
  SITE_URL: z.url(),

  REDIS_URL: z.url(),

  /* Shared secret for the manual render trigger. The Hygraph webhook has its
     own signature verification; this guards the endpoint used to re-render
     by hand. */
  RENDER_SECRET: z.string().min(1),

  /* Shared with the Hygraph webhook, which signs each payload with it. */
  HYGRAPH_WEBHOOK_SECRET: z.string().min(1),

  /* Resend, for POST /contact. No default and no dev stub: a misconfigured
     deploy should fail at boot rather than silently dropping enquiries. */
  RESEND_API_KEY: z.string().min(1),

  /* Must be on a domain verified in Resend or delivery is refused outright.
     Deliberately not the same address as CONTACT_TO — sending and receiving
     are separate concerns, and a forwarding alias is not a mailbox that can
     send. */
  CONTACT_FROM: z.email(),
  CONTACT_TO: z.email(),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  /* Where uploaded objects are publicly readable. The site rewrites its own
     paths to this, so visitors never see it. */
  R2_PUBLIC_BASE: z.url(),
});

type TEnv = z.infer<typeof envSchema>;

const invalidMessage = 'Invalid environment configuration:';

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map(({ path, message }) => `${path.join('.') || '(root)'} — ${message}`)
    .join('; ');

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

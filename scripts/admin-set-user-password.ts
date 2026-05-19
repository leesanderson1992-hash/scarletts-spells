import { createClient } from "@supabase/supabase-js";

type ParsedArgs = {
  userId: string | null;
  password: string | null;
};

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  let userId = process.env.SUPABASE_AUTH_USER_ID?.trim() ?? null;
  let password = process.env.SUPABASE_AUTH_NEW_PASSWORD ?? null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--user-id" && next) {
      userId = next.trim();
      index += 1;
      continue;
    }

    if (current === "--password" && next) {
      password = next;
      index += 1;
    }
  }

  return {
    userId,
    password,
  };
}

async function main() {
  // Local-only admin utility. Run from the terminal, never from app routes.
  // Example:
  // npm run admin:set-user-password -- --user-id "<supabase-user-id>" --password "<temporary-password>"
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      "Refusing to run without SUPABASE_SERVICE_ROLE_KEY. Set it in your local environment only.",
    );
  }

  const { userId, password } = parseArgs(process.argv.slice(2));

  if (!userId) {
    throw new Error(
      "Missing user id. Pass --user-id <supabase-user-id> or set SUPABASE_AUTH_USER_ID.",
    );
  }

  if (!password) {
    throw new Error(
      "Missing new password. Pass --password <new-password> or set SUPABASE_AUTH_NEW_PASSWORD.",
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  const safeEmail = data.user.email ?? "email unavailable";
  console.log(`Password updated for user ${safeEmail}.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Failed to set Supabase Auth password: ${message}`);
  process.exitCode = 1;
});

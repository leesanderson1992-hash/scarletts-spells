import { signInWithPasswordAction } from "./actions";

export function LoginForm() {
  return (
    <form action={signInWithPasswordAction} className="brand-card rounded-3xl p-6">
      <div className="mb-5">
        <h2 className="brand-title text-2xl font-semibold">Email login</h2>
        <p className="brand-copy mt-1 text-sm">
          Enter your email and password to continue to your dashboard.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Email
          <input
            type="email"
            name="email"
            required
            className="brand-input h-11 rounded-2xl px-4 text-sm transition"
            placeholder="parent@example.com"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Password
          <input
            type="password"
            name="password"
            required
            className="brand-input h-11 rounded-2xl px-4 text-sm transition"
            placeholder="Enter your password"
          />
        </label>

        <button type="submit" className="brand-primary-btn">
          Sign in
        </button>
      </div>
    </form>
  );
}

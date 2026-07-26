# Dependency security policy

Production dependencies must pass:

```bash
npm run security:audit:production
```

High and critical production advisories block release. The full dependency
audit is also run and reported, but development-only lint-toolchain advisories
may be accepted temporarily when no credible patched dependency set exists.

## Temporary ESLint toolchain exception

- recorded: 2026-07-26
- next review: 2026-08-09
- scope: development-only ESLint packages and plugins
- production exposure: none; these packages are not deployed by the Next.js
  production build
- reason: the npm advisory graph currently recommends incompatible ESLint
  major upgrades and invalid `eslint-config-next` downgrades, while the latest
  compatible Next.js lint toolchain still resolves the affected plugins
- exit condition: upgrade to a compatible patched ESLint and
  `eslint-config-next` set, then require the full audit to pass

The exception does not permit production vulnerabilities, disabling the
production audit, or using `npm audit fix --force`.

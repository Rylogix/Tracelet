# Contributing

Keep integrations honest, modular, privacy-conscious and free by default. Never commit API keys, runtime data, `.dev.vars`, session cookies or provider credentials. Add fixtures only to tests; do not seed application dashboards with synthetic findings.

Before enabling an adapter, document its exact license and provider terms, credentials, supported input, cost/quota source, safety rate, output schema, timeout/cancellation and maintenance review. Test at least one permitted real lookup and mock errors/quota failures. Do not introduce account enumeration, covert monitoring, active scans or paid requests without explicit product/security review.

Run Python, TypeScript, Workers unit tests, desktop/mobile Playwright checks and dependency audits. Describe the concrete user-visible change and its validation in pull requests. Native OS installation claims require testing on that OS. Respect existing changes and keep generated runtime data outside git.

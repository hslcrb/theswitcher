# Repository instructions · 작업 규칙

- Browser-only static tool. No user-file uploads, remote runtime dependencies, analytics, backend, or GitHub Actions.
- Keep one full-file conversion worker at a time. Preserve byte, table, queue, result, and timeout limits. Do not use main-thread fallback for unsafe or unsupported inputs.
- Use topic branches and microcommits: test, one behavioral change, then docs where separable. Merge verified commits without rewriting history.
- Use English commit type + short Korean summary. Add Korean/English comments for non-obvious invariants or trade-offs.
- Compare with actual TTF/CFF fixtures and record limitations accurately. Cloudflare Pages Git integration, production `main` only, no preview deploy.
- Review `CONTRIBUTING.md` and `SECURITY.md`; never put user fonts or secrets in Git.

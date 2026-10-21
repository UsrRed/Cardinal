---
name: security-review
description: Review code for common web vulnerabilities (OWASP-style) before final delivery — injection, XSS, broken auth, insecure secrets handling, SSRF, path traversal. Use during review/final-verify passes, not for every small edit.
---

# Security review

Before marking a feature or the whole project done, scan the code you just wrote or touched for these classes of bugs. Fix what you find; don't just note it.

- **Injection**: any SQL/shell/template built by string concatenation with user input. Use parameterized queries, `execFile` with an argv array (never `exec`/`shell: true` with interpolated input), and escape/validate template output.
- **XSS**: user-controlled data rendered into HTML/DOM without escaping (`dangerouslySetInnerHTML`, raw template interpolation, `innerHTML =`). Prefer the framework's default escaping; sanitize explicitly if raw HTML is unavoidable.
- **Auth/session**: endpoints that mutate or read sensitive data without checking the caller is authorized for that specific resource (not just "logged in"); tokens/session ids in URLs or logs; missing expiry on long-lived tokens.
- **Secrets**: API keys, passwords, or tokens hard-coded, committed, or echoed back in an HTTP response/log. Secrets belong in env vars or a dedicated secret store, written but never read back through an API.
- **Path traversal**: any file read/write built from a user-supplied path. Resolve and verify the result stays inside the intended root before touching the filesystem.
- **SSRF**: server-side requests to a URL supplied by the user (webhooks, "fetch a link" features) without restricting scheme/host, especially against internal/loopback addresses.
- **Deserialization / eval**: `eval`, `new Function`, or unsafe deserializers fed by external input.

Report findings as: file:line, the concrete exploit scenario (what input, what happens), and the fix applied — not a generic "could be a risk" note.

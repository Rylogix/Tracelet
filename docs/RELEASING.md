# Release packaging

Run every CI check, audit dependencies, verify permitted live keyless providers, and test supported installation paths. Read docs/VALIDATION.md; don't promote untested platforms or credentials to tested status. Inspect `git status` and stage explicit source paths; never package `data`, `.venv`, node_modules, .dev.vars, .wrangler, investigation exports or credentials.

Create a source ZIP from the committed tree:

```sh
git archive --format=zip --prefix=Tracelet/ HEAD -o /tmp/Tracelet-source.zip
```

Publish the source archive to a GitHub release only after the repository exists and checks pass. GitHub's automatic source ZIP is also usable with the launch scripts. No signed Windows/macOS binary or bundled native-tool distribution is promised. Optional native tools retain their licenses and must not be included without checking redistribution obligations.

For Cloudflare deploys, source commits and deployments should be tracked together. The manual deploy workflow requires operator-supplied scoped secrets and an actual D1 ID. Never ship the placeholder ID as a production configuration. Run live login and provider health checks at the public domain after deployment. Roll back code through Cloudflare's deployment controls; assess schema compatibility before rolling back migrations.

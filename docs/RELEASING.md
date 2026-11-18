# Website releases

1. Run the checks in [CI](../.github/workflows/ci.yml), including the hosted desktop and mobile browser tests. Review [validation coverage](VALIDATION.md) before making claims about live providers.
2. Verify that the commit contains only public source and documentation. Keep environment files, credentials, local databases, and report exports out of Git.
3. Tag the tested commit and publish a GitHub release with website change notes. GitHub provides the source archives automatically.

Production deployment uses the [Cloudflare workflow](../.github/workflows/deploy-cloudflare.yml). Track the deployed commit and verify sign-in and provider health at the public domain. See [Cloudflare setup](CLOUDFLARE.md) for deployment and configuration.

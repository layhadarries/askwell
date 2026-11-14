```bash
npx @therealjsmastery/jsm-hq
sbx secret set github --command 'gh auth token'

sbx login

```

## Deploy (Vercel)

- Every PR gets a Vercel preview. Get its URL from the Vercel comment on the PR, not from the branch name.
- Previews are protected. Send `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` on every request.
- Production is never promoted automatically. The product owner promotes it by hand.

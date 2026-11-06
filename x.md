Two things to do in the Sanity dashboard before real use

1. Production CORS origin — I added http://localhost:3000; add your deployed URL under API → CORS origins (manage.sanity.io) or the studio will be blocked in prod.
2. Webhook — create it under API → Webhooks: URL https://<your-domain>/api/sanity-revalidate, trigger on Create/Update/Delete for docPage + docSection, and set the secret to the SANITY_REVALIDATE_SECRET value in your .env.local (same value in the deploy env).
   Deployment needs the five env vars from .env.example (tokens included — the private dataset requires the read token for builds).
   Want me to push the branch, or merge feat/sanity-cms (which includes the icons commit) into main?

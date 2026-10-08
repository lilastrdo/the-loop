# the Loop — Digital Business Card Platform

A GitHub Pages-compatible digital networking website. Features include account signup/login, editable profiles, public cards, QR codes, native sharing (AirDrop/nearby sharing when supported by OS/browser), contact file downloads, and two-way contact exchange.

## Files
- `index.html`, `styles.css`, `app.js`: static website
- `config.js`: public project settings (publishable key ONLY)
- `supabase/schema.sql`: secure database tables and access policies
- `supabase/functions/exchange-contact/index.ts`: backend for anonymous contact exchange

## Preview now
Open `index.html` in a browser and select **Demo**. Demo works without a database. Some browsers require a local HTTP server for all browser APIs; for example, run `python -m http.server 8000` in this directory and visit `http://localhost:8000`.

## Connect real accounts
1. Create a Supabase project at https://supabase.com and run `supabase/schema.sql` in SQL Editor **once**.
2. In Supabase Authentication → URL Configuration, add your final GitHub Pages URL to allowed redirect URLs. Enable email confirmations and configure SMTP for a real launch.
3. Copy your project URL and **publishable/anon** key into `config.js`; set `siteUrl` to your deployed URL (for project repos use `https://USERNAME.github.io/REPOSITORY`). **Never put `service_role` keys or other secrets in browser files or GitHub.**
4. Create a Cloudflare Turnstile widget for your domain. Put its **site key** in `config.js`. Add its **secret key** to Supabase Edge Function secrets as `TURNSTILE_SECRET_KEY`. Set `SUPABASE_SERVICE_ROLE_KEY` as an Edge Function secret. Do not expose secrets in website source.
5. Deploy Edge Function: `supabase functions deploy exchange-contact --no-verify-jwt`. Public visitors can submit contact exchange forms without logging in. The Edge Function verifies Turnstile and validates the form. For production, add rate limiting (at a CDN/WAF or backend) and privacy-policy/retention controls; Turnstile alone does not guarantee abuse prevention.
6. Commit the static files to a GitHub repo. In Settings → Pages choose **Deploy from branch**, main branch, root folder. GitHub Pages will publish the website at your repo URL.
7. Open the website, sign up, confirm your email if enabled, edit your profile, check **Publish my card**, and save. Share the `#/u/USERNAME` link or QR code.

## Notes
- The share button opens the operating system native share sheet *when available*. It cannot force Bluetooth or AirDrop directly. Copy-link fallback is included.
- Public cards expose any email and phone information entered in the profile. Use business contact info, not private details.
- Profile photos use **HTTPS image URLs** in this first version; file uploads would require a storage setup.
- Public card URLs use hash routing (`#/u/username`) so GitHub Pages doesn't need custom rewrites.
- No private contact exchange details are stored in the browser or local storage; account authentication uses Supabase Auth session persistence.
- The exchange form sends a submission to the owner only; it does **not** automatically disclose the visitor's info to third parties or create a reciprocal connection. Visitors must consent.
- For launch, also add privacy policy, terms, delete-account/data request process, spam monitoring, backup/retention rules, and optionally a custom domain.

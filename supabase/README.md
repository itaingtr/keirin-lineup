# Shared race comments

The existing static GitHub Pages site cannot store shared comments on its own. This Supabase setup provides shared comments that appear on every device. Visitors can read comments; only the account added to `race_comment_writers` can post, edit, or delete them.

## Setup

1. Create a Supabase project and open its SQL Editor.
2. Run [`setup.sql`](setup.sql).
3. In Authentication settings, enable email OTP or magic-link sign-in and set the site's URL (`https://itaingtr.github.io`) as an allowed redirect URL.
4. The site integration needs the project's **Project URL** and **publishable key**. These are intended for browser use with Row Level Security enabled. Never put a `service_role` or secret key in the site.
5. Sign in once with the account that will own the board. Add that account's Auth user UUID to `public.race_comment_writers` using the SQL snippet at the bottom of `setup.sql`.
6. Configure the site with the Project URL and publishable key, then publish the updated pages.

Supabase Auth supports email OTP and magic links. The browser can use a publishable key because row access is constrained by RLS; secret/service-role keys bypass those policies and must stay server-side. See the [Supabase Auth guide](https://supabase.com/docs/guides/auth), [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), and [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

“Permanent” means retained in the hosted database while the project and account remain active. No hosted service can promise literal forever, so periodically export the table from Supabase for an independent backup.

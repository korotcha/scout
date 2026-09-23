# Market Radar — context for coding agents

Read START_HERE.md and docs/handoff/*.md first. They supersede historical workflow
notes where marked. This is an existing application, not a blank project.

Preserve calculations, saved data, migrations, role checks and revision handling
when editing visuals. Current design is intentionally basic; see DESIGN.md.
Do not automatically apply external GitHub design skills or restore the old theme.

Use the existing Sites project ID only when working on the current Site.
A source archive is not a production database export. Secrets are not included.
When porting, explicitly handle Cloudflare bindings and trusted authentication;
never remove authentication or trust browser-supplied identity headers in production.

Never sum rolling frequency samples into a monthly total. Describe approximation
and missing data honestly. Cache upstream responses; one UI analysis may require
several billed reports. Do not promise unlimited access based on one observation.

Build: npx vinext build. Typecheck: npx tsc --noEmit.
Tests: node --test tests/*.test.mjs (some require modern node:sqlite).
Existing npm build/install:ci wrappers target Linux, not native macOS.

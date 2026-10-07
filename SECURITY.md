# Security Policy

## Supported versions

Only the latest release and the current `main` branch receive fixes.

| Version | Supported |
| --- | --- |
| Latest release / `main` | Yes |
| Older releases | No |

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: go to the repository's **Security** tab, choose **Report a vulnerability**, and fill in the form. Include what you found, how to reproduce it, and the impact you expect.

## What to expect

- Acknowledgement within 3 working days.
- An initial assessment within 7 days.
- A fix or a clear plan within 30 days for confirmed issues, sooner for serious ones.
- Credit in the advisory if you want it.

This is a volunteer-run project, so these are targets, not guarantees.

## Scope

ROI Calculator is a local, static web app. It has no server, no accounts, no authentication, and sends no project data anywhere; projects are stored in your browser. That narrows what counts as a vulnerability. In scope:

- Cross-site scripting or injection through imported project files, catalogue data or exports.
- Vulnerable dependencies that are reachable in the shipped app.
- Problems in the build, price scripts or GitHub workflows (for example, secret exposure or unsafe script execution).

Out of scope: issues that need an attacker who already controls your machine or browser, and wrong prices (use a price correction issue for those).

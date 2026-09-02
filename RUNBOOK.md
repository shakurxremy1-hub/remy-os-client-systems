# opmventuresllc.com — Operations Runbook

Everything needed to keep the site live and to recover it if something breaks.
Last updated: 2026-09-02.

---

## 1. What this site is

- **One file**: `index.html` (all CSS + JS inline). No build step. What's on `main` is what's live.
- **Assets**: `assets/` — JPEG frame sequences (`frames/` desktop, `frames-m/` mobile),
  video clips, images.
- **Host**: GitHub Pages, served from `main` branch, root (`/`).
- **Repo**: `git@github.com:shakurxremy1-hub/remy-os-client-systems.git` (public — must stay public for free Pages).

---

## 2. DNS (managed at GoDaddy)

| Type | Host | Value | Purpose |
|------|------|-------|---------|
| A | `@` | `185.199.108.153` | GitHub Pages |
| A | `@` | `185.199.109.153` | GitHub Pages |
| A | `@` | `185.199.110.153` | GitHub Pages |
| A | `@` | `185.199.111.153` | GitHub Pages |
| CNAME | `www` | `shakurxremy1-hub.github.io` | GitHub Pages (redirects www → apex) |

- Registrar: **GoDaddy.com, LLC**. Nameservers: `NS43/NS44.DOMAINCONTROL.COM`.
- Registration expires: **2027-01-07**. Keep auto-renew ON with a valid card.
- The repo file `CNAME` contains `opmventuresllc.com` — do not delete it; it tells Pages which domain to answer for.

### KNOWN ISSUE to fix once
`www.opmventuresllc.com` currently has a CNAME to `cname.gamma.site` (an old Gamma
site). Until changed, `www.` does NOT serve this site.
**Fix:** GoDaddy → DNS → edit the `www` CNAME → set value to
`shakurxremy1-hub.github.io` → save. Propagates in minutes to a few hours. Then in
GitHub → repo Settings → Pages, confirm the domain check still passes and
"Enforce HTTPS" is still ticked.

---

## 3. Health checks

```bash
# Is it up and served by GitHub? (expect HTTP/2 200 and a "server: GitHub.com" header)
curl -sI https://opmventuresllc.com | head -n 5

# Is the latest commit deployed? (compare to `git rev-parse --short HEAD`)
curl -s https://opmventuresllc.com/index.html | grep -c "df-root"   # sanity: >0

# DNS still pointing at Pages?
dig +short opmventuresllc.com A        # expect the four 185.199.108-111.153
```

Optional external monitor (recommended): create a free UptimeRobot / Better Stack
monitor on `https://opmventuresllc.com`, HTTP(S), 5-min interval, alert to your
email + phone. Takes 2 minutes, tells you within 5 min if the site ever goes dark.

---

## 4. Deploying a change

```bash
git add -A
git commit -m "describe the change"
git push origin main
```

GitHub Pages rebuilds automatically, usually live in 30–90 seconds. There is no
staging — verify locally first:

```bash
python3 -m http.server 8899   # then open http://localhost:8899
```

For a risky change, do it on a branch, push the branch, and preview with a local
server before merging to `main`.

---

## 5. Rolling back a bad deploy

The site broke right after a push. Get back to the last known-good state:

```bash
# Option A — undo just the last commit's changes, keep history clean
git revert HEAD
git push origin main

# Option B — restore every file to a tagged known-good version
git checkout v1.0 -- .
git commit -m "roll back to v1.0"
git push origin main
```

Known-good tags:
- **`v1.0`** — desktop + mobile cinematic fly-through, Calendly wired, OG image,
  circular favicon. (commit `ae7c758`)

Tag a new known-good point after any release you're happy with:
```bash
git tag -a v1.1 -m "what's good about this one"
git push origin v1.1
```

---

## 6. Backups

The GitHub repo is the primary copy. Keep an offline mirror as well:

```bash
# One-time + repeat any time to refresh:
mkdir -p ~/backups
git bundle create ~/backups/remy-os-client-site-$(date +%Y%m%d).bundle --all
```

A `.bundle` file is the entire repo + history in a single file. To rebuild from one:
```bash
git clone ~/backups/remy-os-client-site-YYYYMMDD.bundle recovered-site
```

Also fine: keep a zip of the project folder in cloud storage (Drive / Dropbox).

---

## 7. If GitHub Pages itself is the problem

- **Repo went private** → Settings → change back to Public (free Pages needs public).
- **"Enforce HTTPS" unticked / cert error** → Settings → Pages → re-tick Enforce HTTPS.
  If the domain shows an error, remove and re-enter `opmventuresllc.com` in the
  Custom domain box to re-run the DNS check and re-issue the cert.
- **Pages not building** → Settings → Pages → confirm Source = "Deploy from a branch",
  branch `main`, folder `/ (root)`. Check the Actions tab for a failed
  "pages build and deployment" run.
- **Bandwidth / size limits** → soft limits are 1 GB repo and 100 GB/month bandwidth.
  Current repo ~250 MB. If frame re-renders push it up, squash history or move the
  frame sets to a release asset / CDN.
- **Whole account lost** → restore the repo from a backup bundle (section 6) to a new
  GitHub account, re-add the custom domain in Pages, DNS already points to Pages so
  no DNS change needed.

---

## 8. Account security checklist

- [ ] 2FA enabled on GitHub account `shakurxremy1-hub`, recovery codes saved offline
- [ ] 2FA enabled on GoDaddy, recovery method saved offline
- [ ] GoDaddy auto-renew ON, valid payment method, registration extended
- [ ] `main` branch protection ON (no force-push, no deletion) — already set
- [ ] At least one recent backup bundle in `~/backups/` and in cloud storage

---

## 9. Calendly (booking flow, not hosted here)

The site links every "Book a call" to `https://calendly.com/shakur-opmventuresllc/30min`.
Confirmation email, reminders, and the meeting join link are configured in Calendly
itself: event type → Notifications and Workflows (turn on the confirmation email, add
reminder workflows), and set the event Location to Zoom or Google Meet so Calendly
generates the join link.

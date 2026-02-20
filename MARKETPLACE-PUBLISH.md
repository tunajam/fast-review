# Publishing Fast Review to GitHub Marketplace

## Pre-flight Checklist

- [x] `action.yml` has `name`, `description`, `author`, and `branding` (icon + color)
- [x] `README.md` has usage examples, inputs table, and badges
- [x] `LICENSE` file exists (MIT)
- [x] `CONTRIBUTING.md` exists
- [x] Release `v1.1.0` exists and is tagged
- [x] Repository is public (`tunajam/fast-review`)

## Publishing Steps (GitHub Web UI)

GitHub Marketplace publishing **requires the web UI** — there's no API/CLI for this.

### First-time publish

1. Go to **https://github.com/tunajam/fast-review**
2. Click the **"Draft a release"** button (or go to Releases → edit `v1.1.0`)
3. On the release edit page, you'll see a checkbox: **☐ Publish this Action to the GitHub Marketplace**
4. **Check that box** ✅
5. GitHub will validate your `action.yml` — make sure branding, name, and description are set
6. Select **Primary category**: `Code quality` 
7. Optionally select a **Secondary category**: `Code review`
8. Click **Update release** (or **Publish release** if drafting new)
9. Done! The action will appear on [GitHub Marketplace](https://github.com/marketplace)

### Verification

After publishing:
- Visit **https://github.com/marketplace/actions/fast-review** (name is slugified)
- Confirm the listing shows the ⚡ icon with yellow branding
- Test the "Use latest version" button copies the right snippet

### Updating the listing

For future releases, the Marketplace checkbox will already be checked. Just create a new release as usual and it auto-updates.

## Notes

- The Marketplace listing description comes from `action.yml`'s `description` field
- The README.md is shown as the full listing page content
- You can edit categories later from the Marketplace listing settings

# Privacy Policy for K12 Video Runner

Last updated: 2026-09-20

## Overview

K12 Video Runner adds a Chrome side panel where users can choose lessons listed on `hcm.k12online.vn` and mark the selected lessons complete. For lessons selected from a list, the extension sends the selected lesson ID to the site's `Lesson/learn` API to get its canonical lesson link, then reads the lesson page before requesting completion. A `Hoàn thành bài` button remains available on individual lesson pages. Non-video courseware uses the `Courseware/markComplete` API; video lessons keep using the site's video completion API.

## What data the extension collects

K12 Video Runner does not collect, store, sell, or share personal data with the extension developer. It stores only the user's preference for showing or hiding the on-page quick button in Chrome's local extension storage.

The extension does not maintain its own backend, database, analytics service, advertising service, or tracking system.

## What the extension accesses locally

To perform its single purpose, the extension may locally read information already present on supported pages of `hcm.k12online.vn`, such as:

- page URL parameters
- page source values embedded in scripts
- lesson titles, progress values, and identifiers shown in the current lesson list
- courseware and lesson identifiers, courseware type, and other values required by the website to process the completion action
- the lessons the user selects for completion

This information is processed locally in the user's browser to enable the requested action.

## What the extension sends

When the user explicitly chooses lessons and clicks the completion button, the extension sends a request only to `hcm.k12online.vn` in order to complete those lessons on that website. It may retrieve the selected lesson page from the same site to read the parameters needed for that request.

The extension does not send user data to the developer or to unrelated third parties.

## Permissions used

The extension uses access limited to:

- `https://hcm.k12online.vn/*`

The extension also uses Chrome's `sidePanel` permission to display its sidebar and `storage` permission to remember the quick-button preference locally. Access to the site is used only so it can:

- read the current lesson list and detect supported courseware lesson pages
- display the action button on those pages
- read the values needed to perform the requested action
- send the completion request back to the same website

## Remote code

K12 Video Runner does not use remote code.

All JavaScript and CSS executed by the extension are packaged with the extension itself. The extension does not load external JavaScript, does not run external Wasm, and does not use `eval()` to execute remote code.

## Data retention

The extension developer does not store user data. The extension stores only the quick-button preference locally in the browser; lesson selections and completion request data are not saved by the extension.

## Data sharing and sale

The extension developer does not sell user data.

The extension developer does not transfer user data to third parties except as required to perform the user-requested action on `hcm.k12online.vn` itself.

## Security

The extension is designed to operate only on `hcm.k12online.vn` and to use the user's current browser session on that same website.

## Changes to this policy

This privacy policy may be updated if the extension's behavior changes. Any future update should be published in this file before or at the same time as the related extension release.

## Contact

Repository: https://github.com/vantanminh/k12-ext

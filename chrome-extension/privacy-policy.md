# Privacy Policy for K12 Video Runner

Last updated: 2026-09-21

## Overview

K12 Video Runner adds a Chrome side panel where users can choose lessons listed on `hcm.k12online.vn` and mark the selected lessons complete. For lessons selected from a list, the extension sends the selected lesson ID to the site's `Lesson/learn` API to get its canonical lesson link, then reads the lesson page before requesting completion. A `Hoàn thành bài` button remains available on individual lesson pages. Non-video courseware uses the `Courseware/markComplete` API; video lessons keep using the site's video completion API. Users can optionally enable a comment after a lesson is completed.

## What data the extension collects

The extension stores the user's preferences and, if entered, their name, class, and student ID in Chrome's local extension storage. The extension developer does not receive these values. When automatic comments are enabled, the extension sends the resulting comment to `hcm.k12online.vn` after a successful completion action.

The extension does not maintain its own backend, database, analytics service, advertising service, or tracking system.

## What the extension accesses locally

To perform its single purpose, the extension may locally read information already present on supported pages of `hcm.k12online.vn`, such as:

- page URL parameters
- page source values embedded in scripts
- lesson titles, progress values, and identifiers shown in the current lesson list
- courseware and lesson identifiers, courseware type, and other values required by the website to process the completion action
- the lessons the user selects for completion

This information is processed locally in the user's browser to enable the requested action. The optional comment profile is stored locally until the user changes or clears it.

## What the extension sends

When the user explicitly chooses lessons and clicks the completion button, the extension sends a request only to `hcm.k12online.vn` in order to complete those lessons on that website. It may retrieve the selected lesson page from the same site to read the parameters needed for that request. If automatic comments are enabled, it also sends the user-provided name, class, and student ID as a comment to the same website.

The extension does not send user data to the developer or to unrelated third parties.

## Permissions used

The extension uses access limited to:

- `https://hcm.k12online.vn/*`

The extension also uses Chrome's `sidePanel` permission to display its sidebar and `storage` permission to remember preferences and optional comment profile fields locally. Access to the site is used only so it can:

- read the current lesson list and detect supported courseware lesson pages
- display the action button on those pages
- read the values needed to perform the requested action
- send the completion request back to the same website

## Remote code

K12 Video Runner does not use remote code.

All JavaScript and CSS executed by the extension are packaged with the extension itself. The extension does not load external JavaScript, does not run external Wasm, and does not use `eval()` to execute remote code.

## Data retention

The extension developer does not store user data. Preferences and optional comment profile fields remain in the browser's local extension storage; lesson selections and completion request data are not saved by the extension.

## Data sharing and sale

The extension developer does not sell user data.

The extension developer does not transfer user data to third parties. When automatic comments are enabled, the extension sends the comment details to `hcm.k12online.vn` as part of the user-requested action.

## Security

The extension is designed to operate only on `hcm.k12online.vn` and to use the user's current browser session on that same website.

## Changes to this policy

This privacy policy may be updated if the extension's behavior changes. Any future update should be published in this file before or at the same time as the related extension release.

## Contact

Repository: https://github.com/vantanminh/k12-ext

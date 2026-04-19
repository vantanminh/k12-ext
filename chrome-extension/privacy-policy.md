# Privacy Policy for K12 Video Runner

Last updated: 2026-04-19

## Overview

K12 Video Runner is a Chrome extension that helps users interact with video lesson pages on `hcm.k12online.vn`. The extension adds a `Chay tien trinh` button on supported video pages and, when the user clicks the button, sends a completion request to the same website using the user's current logged-in session.

## What data the extension collects

K12 Video Runner does not collect, store, sell, or share personal data with the extension developer.

The extension does not maintain its own backend, database, analytics service, advertising service, or tracking system.

## What the extension accesses locally

To perform its single purpose, the extension may locally read information already present on supported pages of `hcm.k12online.vn`, such as:

- page URL parameters
- page source values embedded in scripts
- video-related identifiers required by the website to process the completion action

This information is processed locally in the user's browser to enable the requested action.

## What the extension sends

When the user explicitly clicks the action button, the extension sends a request only to `hcm.k12online.vn` in order to complete the video progress action on that website.

The extension does not send user data to the developer or to unrelated third parties.

## Permissions used

The extension uses access limited to:

- `https://hcm.k12online.vn/*`

This access is used only so the extension can:

- detect supported video lesson pages
- display the action button on those pages
- read the values needed to perform the requested action
- send the completion request back to the same website

## Remote code

K12 Video Runner does not use remote code.

All JavaScript and CSS executed by the extension are packaged with the extension itself. The extension does not load external JavaScript, does not run external Wasm, and does not use `eval()` to execute remote code.

## Data retention

The extension developer does not store user data because the extension does not collect user data for developer-side storage.

## Data sharing and sale

The extension developer does not sell user data.

The extension developer does not transfer user data to third parties except as required to perform the user-requested action on `hcm.k12online.vn` itself.

## Security

The extension is designed to operate only on `hcm.k12online.vn` and to use the user's current browser session on that same website.

## Changes to this policy

This privacy policy may be updated if the extension's behavior changes. Any future update should be published in this file before or at the same time as the related extension release.

## Contact

Repository: https://github.com/vantanminh/k12-ext
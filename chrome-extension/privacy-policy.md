# Privacy Policy for K12 Video Runner

Last updated: 2026-09-30

## Purpose and data flow

K12 Video Runner helps users manage K12 lessons from a Chrome side panel: discover lessons and subjects, request AI exercise answers, submit answers, mark supported material/video viewed, and optionally post comments using per-subject rules. Actions use the user's browser session on hcm.k12online.vn.

There is no analytics, advertising or tracking service. AI solving goes through a Rust AI server: the hosted server operated by the developer, or a server the user runs on localhost or their own HTTPS host. The OpenAI API key is configured on that server, never in the extension.

## Email login

To use AI solving on the hosted server, users sign in with an email address and a six-digit code sent to that address; there is no password. The server stores the email address, whether the account is disabled, and per-day counts of AI solves used for the daily limit. Login codes and session tokens are stored only as SHA-256 hashes. The code email is delivered through Cloudflare Email Service. Sessions expire after 30 days or at sign-out; login codes expire after 10 minutes; daily usage counts are deleted after 7 days. The account record is kept until the user asks for deletion through the repository below.

## Data read and stored locally

The extension reads supported K12 page content, lesson/courseware IDs, subjects, progress, exercise questions, answer choices, tables, public PDF/image URLs and website form values needed for the requested action. K12 authentication values stay in the browser.

Chrome local extension storage holds preferences, subject rules, optional Name/Class/Student ID, server address, optional admin token, the login email and session token, the latest AI result and up to 10 cached exercise results. It also holds up to 100 comment-history records to avoid duplicate posts. Users can edit or clear profile fields in the side panel. Lesson selections are not saved after the side-panel session.

## Data sent to K12

When users select lessons and run an action, the extension opens lesson pages as necessary and sends the appropriate K12 requests using the current browser session. These include opening exercise attempts, submitting validated answers, marking supported materials/video viewed and checking progress. If comments are enabled, it sends the user-entered Name, Class, Student ID and answer summary or viewed message to K12's discussion service. Comments may be visible to people with access to that discussion.

## Data sent for AI

When AI solving is requested, normalized question text, question IDs, choices and optional public K12 PDF/image URLs are sent to the configured Rust server with the user's session token (or an optional admin token). That server forwards exercise content to OpenAI. OpenAI retrieves supplied public PDFs; Rust downloads public images without K12 cookies or authentication and forwards their bytes to OpenAI.

K12 cookies, securityToken, account details and the comment profile are excluded from this AI payload. The server sends store: false in Responses API requests. OpenAI processes requests according to the API account's settings. If users select a hosted backend, its operator may receive exercise content and connection metadata; choose a server you control or trust.

## Optional API diagnostic log

Only when enabled, the extension observes K12 LMS fetch/XHR requests and responses, including portal POST requests carrying an LMS service. It redacts token/cookie/account fields and stores a bounded log locally: at most 80 entries and 1.5 MB, dropping older entries. HTML responses retain summary metadata rather than full HTML. Logs are not sent to the AI server or OpenAI. Users may export a local JSON file; turning recording off stops new captures.

## Permissions

Required host access covers https://hcm.k12online.vn/* and localhost HTTP addresses for the AI server. The optional permission declaration https://*/* allows the extension to request access to the particular HTTPS backend origin entered by the user; it does not request blanket HTTPS access at installation.

sidePanel displays the UI and storage saves local settings/results/history. The extension does not require the cookies permission. Its packaged JavaScript and CSS contain all executable extension code; it does not download or execute remote JavaScript or Wasm or evaluate remote code.

## Retention, sharing and security

The developer does not sell user data. The hosted server keeps only the email login and usage data described above; exercise content passes through it to OpenAI and is not stored. Local settings and records remain until replaced, cleared through available controls, or the extension is uninstalled. Exported files remain wherever users save them. User-enabled comments are stored by K12; OpenAI and a user-chosen hosted backend have their own retention settings.

Local HTTP backend addresses are restricted to loopback. Remote backend addresses require HTTPS and explicit access to the selected origin. Solving requests require a signed-in session or an admin token; neither is a K12 credential. Secrets should not be included in exported diagnostic files or shared packages.

## Changes and contact

This policy should be updated alongside changes to extension behavior.

Repository: https://github.com/vantanminh/k12-ext

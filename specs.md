# IsEmailSpam Thunderbird extension specification

## Purpose and implementation boundary

Build a Thunderbird MailExtension with a message-toolbar button that submits the displayed message's sender email address to https://isemailspam.com, plus an options page for the user's API key. `isemailspamc.com` in the original request was a typo; the user confirmed isemailspam.com.

Implementation is authorized (confirmed 2026-10-15). The implementation task should produce source, tests, documentation and an installable XPI; do not install, publish, use real credentials, or send real spam reports without separate authorization.

## Confirmed product behavior

The user selected a dropdown with both **Check** and **Report**. Provide one message-toolbar button labeled “IsEmailSpam” which opens a popup containing two clearly labeled actions: “Check sender” and “Report sender as spam”. Both use the same sender and API key. Opening the dropdown makes no API request. Check performs a read-only blacklist lookup; Report submits a spam report. Keep these operations distinct in UI, code and tests.

## Target environment

- Verified development machine: Arch Linux, COSMIC on Wayland; installed Thunderbird package 157.0.1-1 on 2026-10-15.
- Use public MailExtension APIs with Manifest V3, JavaScript modules where supported, HTML/CSS and packaged icons. No privileged experiments, native helper, remote executable code, or desktop-specific integration.
- Declared minimum Thunderbird version: 147.0 if the official docs confirm every used API and behavior (`message_display_action`, MV3 `messageDisplay` displayed-messages method, `messengerUtilities.parseMailboxString`, `storage.local`, MV3 background scripts) exist there. If any does not, raise `strict_min_version` to the lowest version where all are documented, and record the reason in the README. Do not add compatibility shims for older versions. Test the installed version; do not claim ESR or other OS compatibility without testing.
- Prefer plain JavaScript and a small development toolchain; no frontend framework is necessary. Keep runtime assets self-contained and readable.

## User experience

1. Add a clearly labeled message display toolbar button. Use “IsEmailSpam” with tooltip “Check or report this sender with IsEmailSpam”.
2. Operate on exactly one displayed message, including the reading pane, a message tab and a separate message window. If there is no single message or sender, disable the operation or explain why it is unavailable. No bulk mode in v1.
3. Clicking the button opens a compact action popup showing the parsed sender address, the service destination, current state, and a visible Settings link.
4. Selecting “Report sender as spam” shows a compact confirmation in the popup with the address and a final “Report as spam” submission, explaining that this submits a spam report. Cancel returns to the action choices; opening the dropdown or selecting Check never reports. Display names and From headers can be spoofed, so do not imply sender identity has been verified.
5. Selecting “Check sender” performs the lookup; opening the toolbar popup alone does not. Show separate email and domain results; a lack of a blacklist match is not proof that a message is safe.
6. Missing key: display “Add your API key in Settings”; do not make a request.
7. During a request, display progress and disable repeated submission. Display a clear success or actionable error in the popup. Bind results to the original message and sender, never to whatever message becomes selected later.
8. Popup closing: Thunderbird may close the popup (e.g. on focus loss) while a request runs. The request continues in the background script and is not aborted. Reopening the popup for the same message and sender shows the in-progress state or the latest result (success, error or “outcome unknown”) of each action. Results are held in memory only for the session, keyed by message ID + sender, and are never persisted to storage. Results for a different message are never shown. The popup may offer a way to dismiss the shown result and return to the action choices.
9. Keep popup text readable with keyboard navigation, visible focus, accessible labels, and light/dark themes. Render remote or message-derived strings as text, never HTML.

## Sender extraction

- Use the clicked message context, not an arbitrary active tab. With an action popup, resolve its parent message tab using the documented Thunderbird pattern.
- Use `messenger.messageDisplay` and the version-appropriate displayed-messages method. With Manifest V3, verify the return type and pagination rather than assuming Manifest V2's array behavior.
- Take the author from Thunderbird's MessageHeader (the From identity), not Reply-To, Return-Path, recipients, the message body, or the Sender header. State this meaning of “sender” in the README.
- Parse it using `messenger.messengerUtilities.parseMailboxString`, with mailing-list expansion disabled. Do not split addresses on commas or extract them with an ad-hoc regex.
- Require exactly one usable mailbox. Reject missing, malformed, grouped or multiple-author identities with a readable error; do not silently choose one or send a batch.
- Strip display-name syntax and surrounding whitespace. Preserve the local part; lowercase only the domain if normalization is necessary. Reject control characters. Do not invent ASCII-only restrictions that reject valid addresses; document unsupported international addresses if the API cannot accept them.
- Do not fetch message bodies, attachments or raw MIME to obtain an author already present in MessageHeader.

## Service contract

Authoritative reference: https://isemailspam.com/use-api (reviewed 2026-10-15). Recheck before coding; do not guess additional endpoints or response semantics.

Report action: POST `https://isemailspam.com/api/report`, `Accept: application/json`, URL-encoded body containing `api_key` and `email`. Do not send `domain` too, or use an Authorization header. Validate the documented success envelope (`data.status`, `data.type`, nested returned email); a generic 2xx alone is insufficient.

Check action: GET `https://isemailspam.com/api/check` using encoded `api_key` and `email` query parameters. Parse the `data.spam_email` and `data.spam_domain` objects, including their `is_spam` booleans and checked values. Never interpret missing booleans as false.

Unknown keys return HTTP 401. Account-dependent usage limits apply; handle HTTP 429 and any Retry-After information without inventing a fixed quota. Other error payloads, duplicate-report behavior and international-address acceptance are not fully documented; handle defensively and record uncertainty.

Build URLs/form data with URL/URLSearchParams. Use HTTPS only and reject redirects to avoid leaking credentials to another host. Do not log complete request URLs, bodies or keys. Set a finite timeout (15 seconds) with AbortController; do not automatically retry submissions. A timed-out report may already have been accepted: say “Outcome unknown; the report may have been received.”

## Options page and credential handling

- Register a standard `options_ui` page, accessible through Thunderbird's add-on preferences and the action popup.
- Provide a masked API-key field, explicit Show/Hide control, Save, and Remove key. Include a link to the service website for obtaining a key.
- Save a trimmed nonempty key in `messenger.storage.local`; persist across restarts and upgrades. Removal must actually delete it. A blank Save must not silently erase an existing key.
- Explain that local extension storage is not an encrypted password vault and that the key remains in the Thunderbird profile. Never use sync storage, source files, telemetry, console output, or export files for keys.
- Show “Key saved” as a local status, not “Key verified”. No background API validation call; validate on the user-requested operation.
- Explain that the sender's email address is transmitted to IsEmailSpam when the user submits. No message content, subject, recipients or attachments leave Thunderbird.

## Architecture and permissions

Suggested layout:

- `manifest.json`, `icons/`
- `background.js`: register listeners at top level; validate messages from extension pages; coordinate requests and prevent duplicate in-flight submissions.
- `popup/`: sender preview, action controls and result rendering.
- `options/`: API-key management.
- `lib/sender.js`, `lib/api.js`, `lib/settings.js`: independently testable parsing, HTTP handling and persistence boundaries.
- `tests/`, `README.md`, packaging command/script producing `dist/isemailspam.xpi`.

Use `messagesRead`, `storage`, and host permission limited to `https://isemailspam.com/*`. A `message_display_action` manifest entry supplies the toolbar integration. Do not request message modification, address book, account enumeration or all-sites access. Do not mark junk, delete, move or modify messages. Use the Thunderbird-supported MV3 background mechanism; verify it rather than copying a Chrome-only service-worker manifest. Respect event-page lifecycle; treat in-memory deduplication as session-scoped and do not promise durable exactly-once delivery.

Keep network operations centralized. Snapshot the sender before asynchronous work and key request state by message/sender. Validate runtime message types and sender context. Clear in-flight state on completion, failure and cancellation. Do not persist sender/report history in v1. No automatic reporting on message display or receipt.

## Errors and resilience

Cover missing/deleted message, ambiguous address, missing key, permissions denied, HTTP 400/401/403/422/429/5xx, offline/DNS/TLS failures, timeout, aborted request, redirect, HTML/non-JSON response and invalid JSON schema. Use conservative error wording, redact secrets, and show Settings for authentication failures. Do not show an untrusted server response verbatim. Retrying requires another explicit user action; do not label an unsuccessful request as reported or an unknown check as safe.

## Tests and acceptance criteria

Automated tests must use mocked Thunderbird APIs and fetch; no real email submissions or API keys. Use Node's built-in `node:test` runner and `node:assert`, with hand-written mocks for `messenger`/`browser` globals and `fetch`; avoid third-party test dependencies. Provide `npm test` (or an equivalent documented command).

- Parse bare and named mailboxes, quoted display names with commas, encoded names, plus addresses, and supported international addresses. Reject missing/multiple/group identities and control characters.
- Verify the precise request method, destination, encoding and permitted fields. Test email characters such as `+`, `&` and Unicode. Assert no subject/body/recipient data is sent.
- Verify settings persistence, explicit removal, blank-input behavior and error handling; prove keys do not appear in logs or errors.
- Exercise successful responses and every error category above, including wrong response types and mismatched reported sender. Test duplicate clicks and message changes during a request. Test that closing and reopening the popup mid-request shows progress and then the result for the same message+sender, does not abort or resubmit the request, and never shows that result for a different message.
- Ensure opening the dropdown sends no request, Check calls only the check endpoint, and Report calls only the report endpoint after confirmation. Verify cancel sends nothing and users can run either action after the other. Permissions must remain narrowly scoped.
- Verify the XPI is a valid ZIP with manifest.json at its root, includes all referenced assets, and excludes test secrets/development artifacts.

Manual test in a disposable Thunderbird profile: load the add-on temporarily, configure a dummy key with mocked responses, exercise all three message display contexts and keyboard/theme behavior, restart to verify settings, and inspect network activity. Real API testing requires separately authorized credentials and a designated test address; never report an arbitrary real person to test the extension. Record tested Thunderbird versions and limitations.

Definition of done: both dropdown actions implemented; tests pass; manifest validates; XPI loads; options and sender-specific action work; privacy behavior is documented; README includes build/test/temporary-install instructions and permission explanations. No claim of live API success without an authorized live test.

## Official references

- Service API: https://isemailspam.com/use-api
- MailExtension development: https://developer.thunderbird.net/add-ons/mailextensions
- Message toolbar action: https://webextension-api.thunderbird.net/en/mv3/messageDisplayAction.html
- Displayed messages: https://webextension-api.thunderbird.net/en/mv3/messageDisplay.html
- Mailbox parser: https://webextension-api.thunderbird.net/en/mv3/messengerUtilities.html
- Storage: https://webextension-api.thunderbird.net/en/mv3/storage.html

Implementation agent: verify version-specific contracts from these primary sources, document decisions and remaining uncertainties, and avoid implementing unrelated filtering, bulk reporting, automatic classification, or domain reporting in v1.

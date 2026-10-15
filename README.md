# IsEmailSpam for Thunderbird

The official Thunderbird add-on for [IsEmailSpam](https://isemailspam.com).
Check the sender of an email against the IsEmailSpam blacklist, or
report it as spam, from Thunderbird's message toolbar.

- **Check sender**: see whether the sender's address or domain is listed.
- **Report sender as spam**: report the address after confirming.
- **Private by design**: only the sender's address is sent, and only when
  you click an action. The subject, body, recipients and attachments
  never leave Thunderbird.

Requires Thunderbird 147 or later and an IsEmailSpam API key.

---

## Contents

- [Installation](#installation)
- [Setup](#setup)
- [Usage](#usage)
- [Privacy](#privacy)
- [Permissions](#permissions)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Releasing](#releasing)
- [Limitations](#limitations)
- [License](#license)

## Installation

**From addons.thunderbird.net** (once published): search for
*IsEmailSpam* under **≡ → Add-ons and Themes**, then click **Add to
Thunderbird**.

**From a file:**

1. Download or build `isemailspam.xpi` (see [Development](#development)).
2. In Thunderbird, open **≡ → Add-ons and Themes** (`Ctrl+Shift+A`).
3. Click **⚙ → Install Add-on From File…** and choose the `.xpi`.
4. Approve the permission prompt.

## Setup

1. Get an API key from [isemailspam.com](https://isemailspam.com).
2. Open the add-on's settings, from **Add-ons and Themes → IsEmailSpam →
   Preferences** or the **Settings** link in its popup.
3. Paste the key and click **Save**.

Saving doesn't contact the service. The key is checked the first time
you run Check or Report.

If your IsEmailSpam API key only accepts certain IP addresses, add your
public IP address to that list in your IsEmailSpam account first.
Otherwise every request is refused (see
[Troubleshooting](#troubleshooting)).

## Usage

Open a message in the reading pane, a message tab or its own window, and
click **IsEmailSpam** on the message toolbar. If the button is missing,
right-click the message toolbar and choose **Customize…** to add it.

The popup shows the sender's address and two actions:

| Action | What happens |
|---|---|
| **Check sender** | Looks up the address and its domain, and shows a separate result for each. *Not listed* doesn't prove a message is safe. |
| **Report sender as spam** | Asks you to confirm, then sends a spam report for that address. |

Opening the popup sends nothing. If you close it while a request is
running, the request keeps going. Reopen the popup on the same message to
see the result.

**Which address is used?** The single address in the message's **From**
header. The Reply-To, Return-Path and Sender headers, the recipients and
the message body are ignored. If the From header contains no address,
several addresses or an address group, the add-on won't guess and shows
an explanation instead.

> From addresses can be forged. Only report a message you are sure is
> spam, and remember that a forged From address may belong to an
> innocent person.

The add-on never marks messages as junk, and never moves, deletes or
changes them.

## Privacy

- **What is sent:** when you click Check or Report, the sender's email
  address and your API key are sent over HTTPS to `isemailspam.com`.
  Nothing is sent when you only open the popup, and nothing is sent
  automatically.
- **What is never sent:** message content, subject, recipients,
  attachments or any other data.
- **Where your key is stored:** in the add-on's local storage inside your
  Thunderbird profile. It's never synced, logged or exported. This
  storage **isn't an encrypted password vault**, so anyone who can read
  your profile can read the key. **Remove key** in the settings deletes
  it.
- **History:** check and report results are kept only in memory, until
  Thunderbird or the add-on restarts.
- **No analytics or telemetry.**

How IsEmailSpam handles the data it receives is covered by its own
policies at [isemailspam.com](https://isemailspam.com).

## Permissions

| Permission | Why it's needed |
|---|---|
| Read your email messages (`messagesRead`) | To read the From header of the message you're viewing. Message bodies are never read. |
| Store data (`storage`) | To save your API key locally. |
| Access `https://isemailspam.com/*` | To call the IsEmailSpam API. No other site is contacted. |

If access to isemailspam.com hasn't been granted, the settings page shows
an **Allow access to isemailspam.com** button.

## Troubleshooting

| Message in the popup | Likely cause | What to do |
|---|---|---|
| *Add your API key in Settings.* | No key saved. | Save your key in Settings. |
| *Your API key wasn't accepted.* | The key is wrong or was revoked (HTTP 401). | Check the key in Settings. |
| *Your account or network isn't allowed to use the API.* | The key only accepts certain IP addresses, or your plan doesn't include API access (HTTP 403). | Add your current public IP address in your IsEmailSpam account, or contact IsEmailSpam support. |
| *Usage limit reached.* | Your account's rate limit was reached (HTTP 429). | Wait for the time shown, then try again. |
| *Outcome unknown; the report may have been received.* | The report timed out after 15 seconds. | Check later before reporting again. |
| *The service rejected this address.* | The address is invalid or not supported, which may include international addresses (HTTP 422). | Nothing to do. |
| *Select just one message…* / *Open a single message…* | Several messages, or none, are selected. | Select one message. |

For errors coming from the add-on itself, open **Tools → Developer Tools
→ Error Console** (`Ctrl+Shift+J`).

Support and bug reports: <https://github.com/rabol/thunderbird-isemailspam/issues>

## Development

Requirements: Node.js 22 or later. There are no npm dependencies.

```sh
npm test        # unit tests (node:test, mocked Thunderbird APIs and fetch)
npm run build   # writes dist/isemailspam.xpi
npm run lint    # optional: Mozilla addons-linter (downloads it via npx)
```

```
manifest.json          Manifest V3
background.js          background script (event page) → lib/controller.js
lib/sender.js          finds the displayed message and parses its From address
lib/api.js             HTTP client: timeout, no redirects, response checks
lib/settings.js        API-key storage
lib/describe.js        result codes → user-facing text
lib/controller.js      popup messages, request deduplication, session results
popup/                 toolbar popup
options/               settings page
icons/                 icon.svg (source) and PNG renders
scripts/build-xpi.mjs  packages the explicit list of runtime files
scripts/zip.mjs        ZIP writer/reader built on Node's zlib
tests/                 unit and packaging tests
listing/               text for the addons.thunderbird.net listing
```

The tests never contact the real service or use real API keys. After
changing `icons/icon.svg`, regenerate the PNGs:

```sh
for s in 16 32 48 64 96 128; do rsvg-convert -w $s -h $s icons/icon.svg -o icons/icon-$s.png; done
```

### Temporary install for testing

1. Start Thunderbird with a disposable profile:
   `thunderbird -profile /path/to/tmp-profile`.
2. Open **Tools → Developer Tools → Debug Add-ons**, choose **Load
   Temporary Add-on…**, and select `manifest.json`.
3. Try the button in the reading pane, in a message tab and in a message
   window.

**Never report a real person's address to test the add-on.**

## Releasing

1. Update `version` in `manifest.json` and `package.json`, and add an
   entry to `CHANGELOG.md`.
2. Run `npm test && npm run build && npm run lint`. The linter's warning
   about `messagesRead` is expected: Mozilla's linter doesn't know
   Thunderbird-only permissions.
3. Upload `dist/isemailspam.xpi` at
   <https://addons.thunderbird.net/developers/>. Use the text in
   [`listing/atn-listing.md`](listing/atn-listing.md) for the listing,
   the privacy policy and the notes to reviewers.
4. No source-code upload is needed. The package contains only
   unminified, hand-written code with no build step.

The add-on ID `{08b95181-0434-4c51-8bec-1ef92df731b6}` must never change
once the add-on is published.

## Limitations

- Only one message at a time; there's no bulk checking or reporting.
- Only addresses can be reported, not whole domains.
- Reporting an address that has already been reported is shown as a
  success, because the address is on the list either way.
- International (non-ASCII) addresses are sent as typed. If the service
  rejects one, the popup says "The service rejected this address".
- Requests time out after 15 seconds and are never retried
  automatically.
- Tested on Thunderbird 157 on Linux. A live **Check** has been verified,
  but a live **Report** hasn't been yet.

## License

[MIT](LICENSE) © 2026 Steen Rabol

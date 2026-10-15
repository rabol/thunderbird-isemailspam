# addons.thunderbird.net listing

Text to paste into the developer hub when submitting. This folder isn't
packaged into the XPI.

## Basic information

- **Name:** IsEmailSpam
- **Add-on URL slug:** `isemailspam`
- **Categories:** Message and News Reading; Privacy and Security
- **Tags:** spam, blacklist, sender, report, anti-spam
- **License:** MIT
- **Homepage:** <https://github.com/rabol/thunderbird-isemailspam>
- **Support site:** <https://github.com/rabol/thunderbird-isemailspam/issues>
- **Requires:** Thunderbird 147.0 or later

## Summary (max 250 characters)

Check whether the sender of an email is on the IsEmailSpam blacklist, or
report it as spam, with one click on the message toolbar. Only the
sender's address is sent, and only when you ask. Requires an IsEmailSpam
API key.

## Description

**IsEmailSpam for Thunderbird** is the official add-on for the
IsEmailSpam service at isemailspam.com. It adds a button to the message
toolbar.

**Check sender:** see at a glance whether the sender's email address or
its domain is listed as spam.

**Report sender as spam:** report a spammer's address in two clicks. You
always confirm before anything is sent.

**Privacy first**

- Only the sender's email address (from the From header) is sent, and
  only when you click Check or Report.
- Message content, subject, recipients and attachments never leave
  Thunderbird.
- No analytics or telemetry, and no history is saved.
- Messages are never moved, deleted or changed.

**Getting started**

1. Get an API key at isemailspam.com.
2. Open the add-on's Preferences and save your key.
3. Open a message and click **IsEmailSpam** on the message toolbar.

Tip: if your API key only accepts certain IP addresses, add your current
public IP address in your IsEmailSpam account.

From addresses can be forged, so only report messages you are sure are
spam.

## Privacy policy

> **IsEmailSpam for Thunderbird: privacy policy**
>
> This add-on sends data only when you explicitly click "Check sender"
> or "Report sender as spam". It then sends, over HTTPS, to
> isemailspam.com:
>
> - the email address from the From header of the message you're
>   viewing, and
> - the IsEmailSpam API key you entered in the add-on's settings.
>
> No other data is sent: no message content, subject, recipients,
> attachments, account information or usage data. The add-on contains no
> analytics or telemetry and contacts no other server.
>
> Your API key is stored only in the add-on's local storage in your
> Thunderbird profile. It isn't encrypted and is never synced. You can
> delete it at any time with "Remove key" in the add-on's settings, or
> by removing the add-on. Check and report results are kept only in
> memory, until Thunderbird or the add-on restarts.
>
> Data received by IsEmailSpam is handled under IsEmailSpam's own terms
> and privacy policy (https://isemailspam.com).

## Notes to reviewers

- This is the official add-on for IsEmailSpam. The developer, Steen
  Rabol, owns and operates isemailspam.com.
- The source is plain, unminified JavaScript, HTML and CSS with no
  bundler or third-party libraries. The uploaded XPI is the source.
  `scripts/build-xpi.mjs` only zips a fixed list of files.
- **Permissions:** `messagesRead` is used to read `MessageHeader.author`
  of the displayed message. `storage` holds the user's API key. The only
  host permission is `https://isemailspam.com/*`.
- **Network:** two documented endpoints are used:
  `GET https://isemailspam.com/api/check` (with `api_key` and `email`
  query parameters) and `POST https://isemailspam.com/api/report` (with
  form fields `api_key` and `email`). Requests are sent only after an
  explicit user click; Report additionally requires a confirmation step.
  Redirects are refused, and requests time out after 15 seconds.
- Remote content is always inserted with `textContent`. The add-on never
  uses `innerHTML`, `eval` or remote scripts.
- **To test:** an API key from isemailspam.com is required. Without one,
  the popup shows "Add your API key in Settings", and an invalid key
  produces "Your API key wasn't accepted". Please use **Check sender**
  for testing rather than Report.

## Screenshots to prepare

Use a clean test message with no personal data visible:

1. The popup after a successful **Check sender** (address and domain
   results).
2. The **Report** confirmation step.
3. The settings page with a masked key.

Recommended size: 1280×800 or similar, as PNG.

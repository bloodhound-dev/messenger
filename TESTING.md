# Testing SecureMessenger

This project is intended to run as an iOS app in Xcode. Because this environment is Linux, iOS frameworks cannot be executed here. Use the following process on macOS.

## 1) Unit tests in Xcode

1. Open your `SecureMessenger` Xcode project.
2. Add the files from `ios/SecureMessengerTests/` into a new Unit Test target (or existing `SecureMessengerTests` target).
3. Ensure the tests are in the test target membership.
4. Run tests:
   - Xcode: `Product > Test`
   - CLI: `xcodebuild test -scheme SecureMessenger -destination 'platform=iOS Simulator,name=iPhone 15'`

## 2) Manual functional validation

### Authentication / MFA
- Enter phone number and tap **Send OTP**.
- Confirm OTP appears in dev hint.
- Enter OTP and tap **Verify MFA**.
- Expected: user is authenticated and enters tabbed app.

### P2P encryption flow
- Open **Chats** and select direct chat.
- Send a message.
- Expected: message appears decrypted in chat list while stored encrypted in persisted envelope data.

### Local-only storage
- Send a few messages.
- Relaunch app.
- Expected: users/chats/messages/telemetry remain locally persisted.

### Dashboard
- Open **Dashboard** tab.
- Expected:
  - Sent/Received counters show totals
  - Peak active users shown
  - Telemetry list renders
  - Map shows user-count annotations by region

## 3) Suggested regression checklist

- OTP invalid code rejected.
- OTP cannot be reused after successful verification.
- Empty messages are not sent.
- Logout returns to login state.

## 4) CI example (macOS runner)

```yaml
name: ios-tests
on: [push, pull_request]
jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: xcodebuild test \
          -scheme SecureMessenger \
          -destination 'platform=iOS Simulator,name=iPhone 15'
```



## 5) Security validation checklist

- OTP lockout: submit invalid OTP 5 times and confirm further OTP requests are blocked temporarily.
- OTP expiry: verify code fails after expiration window.
- Signature integrity: tamper with a stored message envelope and confirm it is rejected on decrypt.
- AAD integrity: alter sender/recipient metadata and confirm AES.GCM auth failure.
- Key-at-rest: confirm private keys are retrieved from Keychain and not stored in JSON files.


## 6) Web app test run

- Start web app: `python -m http.server 4173 -d web`
- Open `http://localhost:4173`
- Validate:
  - MFA login flow works
  - Send/receive encrypted messages in chat
  - Dashboard counters update after sending messages
  - Region map renders user-count markers

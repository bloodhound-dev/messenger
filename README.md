# SecureMessenger iOS (WhatsApp-like Starter)

This repository contains a **SwiftUI iOS starter architecture** for a private messenger app with:

- Phone number login
- MFA (OTP verification)
- End-to-end style peer encryption (device key agreement + message encryption)
- Local-only data persistence on device
- Dashboard with traffic/usage/telemetry
- Map visualization showing user counts by region

> ⚠️ This is a starter implementation for architecture and workflow. Production-grade cryptography should use a battle-tested protocol (e.g., Signal Double Ratchet + audited backend key distribution) and strong threat modeling.

## Project layout

```text
ios/SecureMessenger/
  App/
  Models/
  Services/
  Security/
  Storage/
  ViewModels/
  Views/
```

## Feature summary

### Authentication
- Mobile-number based login screen.
- OTP-based MFA flow (simulated OTP generator/validator for local development).

### Secure messaging
- Local identity key generation per device.
- Peer shared secret via Curve25519 key agreement.
- Per-message encryption/decryption with AES.GCM.

### Storage
- Local-only repositories for users/chats/messages/telemetry using JSON files in app sandbox.
- No cloud persistence.

### Dashboard
- Live traffic counters.
- Usage metrics.
- Telemetry history.
- Map with user counts by geographic region.

## How to use in Xcode

1. Create a new **iOS App (SwiftUI)** in Xcode named `SecureMessenger`.
2. Copy all files from `ios/SecureMessenger/` into the project.
3. Ensure these frameworks are available:
   - `SwiftUI`
   - `CryptoKit`
   - `MapKit`
4. Set `SecureMessengerApp` as the app entry point.

## Notes

- OTP service is simulated to keep all data local.
- Map data is local sample telemetry points.
- Replace local repositories with secure app-group or encrypted database if needed.

## Testing

- A test guide is provided in `TESTING.md`.
- Unit test source files are provided under `ios/SecureMessengerTests/` for Xcode test targets.
- Run on macOS/iOS simulator using `xcodebuild test` (see guide for command).


## Security hardening included

- OTP values are hashed in-memory and compared with a constant-time function.
- OTP expiration, max-attempt limits, and temporary lockout are enforced.
- Long-term private keys are stored in iOS Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) rather than persisted in plaintext files.
- Message ciphertext uses AES.GCM with additional authenticated data (AAD) to bind chat/sender/recipient metadata.
- Messages are signed with Ed25519 (`Curve25519.Signing`) and verified before decryption.

## Important production recommendations

- Replace this simplified protocol with a formally reviewed protocol (Signal double ratchet + prekeys).
- Add secure push transport, certificate pinning, anti-abuse controls, and server-assisted device revocation.
- Integrate App Attest / DeviceCheck and hardened jailbreak/tamper detection as needed for your threat model.


## Web application

A web version is available in `web/` with:
- Mobile-number login + OTP MFA
- Local-only persistence (`localStorage`)
- P2P encrypted messaging using WebCrypto (ECDH + AES-GCM)
- Message signatures using WebCrypto ECDSA
- Dashboard with traffic/usage/telemetry and region map

Run locally:

```bash
python -m http.server 4173 -d web
# open http://localhost:4173
```


## Deploy on Vercel

- Deployment instructions are in `DEPLOYMENT.md`.
- This repo includes `vercel.json` with:
  - route rewrites from `/` to `web/index.html`
  - static asset routes for `app.js` and `styles.css`
  - baseline security headers (CSP, X-Frame-Options, etc.)

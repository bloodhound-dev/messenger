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

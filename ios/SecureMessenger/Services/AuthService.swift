import Foundation
import CryptoKit

private struct OTPRecord {
    let codeHash: Data
    let expiresAt: Date
    var attempts: Int
}

final class AuthService {
    static let shared = AuthService()

    private var pendingOtps: [String: OTPRecord] = [:]
    private var lockouts: [String: Date] = [:]

    private let maxAttempts = 5
    private let otpLifetimeSeconds: TimeInterval = 120
    private let lockoutSeconds: TimeInterval = 300

    private init() {}

    func requestOTP(for phoneNumber: String) -> String? {
        if let lockoutUntil = lockouts[phoneNumber], lockoutUntil > Date() {
            return nil
        }

        let otp = String(format: "%06d", Int.random(in: 0...999_999))
        let record = OTPRecord(
            codeHash: hash(code: otp),
            expiresAt: Date().addingTimeInterval(otpLifetimeSeconds),
            attempts: 0
        )
        pendingOtps[phoneNumber] = record
        return otp
    }

    func verifyOTP(phoneNumber: String, code: String) -> Bool {
        if let lockoutUntil = lockouts[phoneNumber], lockoutUntil > Date() {
            return false
        }

        guard var record = pendingOtps[phoneNumber] else { return false }

        if record.expiresAt < Date() {
            pendingOtps[phoneNumber] = nil
            return false
        }

        let expected = record.codeHash
        let candidate = hash(code: code)
        let isValid = SecureCompare.equals(expected, candidate)

        if isValid {
            pendingOtps[phoneNumber] = nil
            return true
        }

        record.attempts += 1
        if record.attempts >= maxAttempts {
            pendingOtps[phoneNumber] = nil
            lockouts[phoneNumber] = Date().addingTimeInterval(lockoutSeconds)
        } else {
            pendingOtps[phoneNumber] = record
        }

        return false
    }

    private func hash(code: String) -> Data {
        let digest = SHA256.hash(data: Data(code.utf8))
        return Data(digest)
    }
}

enum SecureCompare {
    static func equals(_ left: Data, _ right: Data) -> Bool {
        guard left.count == right.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<left.count {
            diff |= left[i] ^ right[i]
        }
        return diff == 0
    }
}

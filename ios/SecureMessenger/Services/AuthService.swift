import Foundation

final class AuthService {
    static let shared = AuthService()

    private var pendingOtps: [String: String] = [:]

    private init() {}

    func requestOTP(for phoneNumber: String) -> String {
        let otp = String(format: "%06d", Int.random(in: 0...999_999))
        pendingOtps[phoneNumber] = otp
        return otp
    }

    func verifyOTP(phoneNumber: String, code: String) -> Bool {
        guard let expected = pendingOtps[phoneNumber] else { return false }
        let valid = expected == code
        if valid {
            pendingOtps[phoneNumber] = nil
        }
        return valid
    }
}

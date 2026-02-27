import Foundation

@MainActor
final class AppViewModel: ObservableObject {
    enum AuthState {
        case loggedOut
        case otpSent(phone: String, otpHint: String)
        case authenticated(AppUser)
    }

    @Published var authState: AuthState = .loggedOut
    @Published var selectedTab: Int = 0

    private let auth = AuthService.shared
    let repo = MessengerRepository.shared
    let telemetry = TelemetryService.shared

    func requestOTP(phone: String) {
        let otp = auth.requestOTP(for: phone)
        authState = .otpSent(phone: phone, otpHint: otp)
    }

    func verifyOTP(phone: String, code: String) {
        guard auth.verifyOTP(phoneNumber: phone, code: code) else { return }

        if let existing = repo.users.first(where: { $0.phoneNumber == phone }) {
            authState = .authenticated(existing)
            return
        }

        let user = repo.createUser(phoneNumber: phone, name: "User \(phone.suffix(4))", region: "Unknown")
        authState = .authenticated(user)
    }

    func logout() {
        authState = .loggedOut
    }
}

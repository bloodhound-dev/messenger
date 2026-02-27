import SwiftUI

struct LoginView: View {
    @ObservedObject var viewModel: AppViewModel

    @State private var phoneNumber = "+1"
    @State private var otpCode = ""

    var body: some View {
        VStack(spacing: 20) {
            Text("SecureMessenger")
                .font(.largeTitle)
                .fontWeight(.bold)

            switch viewModel.authState {
            case .loggedOut(let error):
                if let error {
                    Text(error)
                        .foregroundStyle(.red)
                }

                TextField("Mobile number", text: $phoneNumber)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.phonePad)

                Button("Send OTP") {
                    viewModel.requestOTP(phone: phoneNumber)
                }
                .buttonStyle(.borderedProminent)

            case .otpSent(let phone, let otpHint):
                Text("OTP sent to \(phone)")
                    .font(.headline)

                Text("Dev OTP: \(otpHint)")
                    .foregroundStyle(.secondary)

                TextField("Enter OTP", text: $otpCode)
                    .textFieldStyle(.roundedBorder)
                    .keyboardType(.numberPad)

                Button("Verify MFA") {
                    viewModel.verifyOTP(phone: phone, code: otpCode)
                }
                .buttonStyle(.borderedProminent)

            case .authenticated:
                EmptyView()
            }
        }
        .padding()
    }
}

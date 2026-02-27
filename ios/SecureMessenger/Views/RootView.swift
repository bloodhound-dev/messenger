import SwiftUI

struct RootView: View {
    @StateObject private var viewModel = AppViewModel()

    var body: some View {
        switch viewModel.authState {
        case .authenticated(let user):
            TabView(selection: $viewModel.selectedTab) {
                ChatsView(currentUser: user, repo: viewModel.repo)
                    .tabItem {
                        Label("Chats", systemImage: "message.fill")
                    }
                    .tag(0)

                DashboardView(telemetry: viewModel.telemetry)
                    .tabItem {
                        Label("Dashboard", systemImage: "chart.bar.xaxis")
                    }
                    .tag(1)

                VStack(spacing: 16) {
                    Text("Profile")
                        .font(.title2)
                    Text("Phone: \(user.phoneNumber)")
                    Text("All data is stored locally on this device.")
                        .foregroundStyle(.secondary)

                    Button("Logout") {
                        viewModel.logout()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
                .tag(2)
            }
        default:
            LoginView(viewModel: viewModel)
        }
    }
}

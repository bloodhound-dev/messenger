import SwiftUI

struct ChatsView: View {
    let currentUser: AppUser
    @ObservedObject var repo: MessengerRepository

    @State private var selectedChat: ChatThread?
    @State private var draft = ""

    var body: some View {
        NavigationSplitView {
            List(repo.chats, selection: $selectedChat) { chat in
                VStack(alignment: .leading) {
                    Text(chat.title)
                    if let last = chat.lastMessageAt {
                        Text(last.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Chats")
        } detail: {
            if let chat = selectedChat {
                VStack {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(repo.decryptedMessages(for: chat.id, forUser: currentUser.id)) { msg in
                                HStack {
                                    Text(msg.text)
                                        .padding(10)
                                        .background(msg.senderID == currentUser.id ? Color.blue.opacity(0.2) : Color.gray.opacity(0.2))
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                    Spacer()
                                }
                            }
                        }
                        .padding()
                    }

                    HStack {
                        TextField("Type message", text: $draft)
                            .textFieldStyle(.roundedBorder)

                        Button("Send") {
                            send(chat: chat)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                }
                .navigationTitle(chat.title)
            } else {
                ContentUnavailableView("Select a chat", systemImage: "bubble.left.and.bubble.right")
            }
        }
    }

    private func send(chat: ChatThread) {
        guard let peer = chat.participantIDs.first(where: { $0 != currentUser.id }) else { return }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        try? repo.sendMessage(chatID: chat.id, senderID: currentUser.id, recipientID: peer, plaintext: draft)
        draft = ""
    }
}

import Foundation
import CryptoKit

final class MessengerRepository: ObservableObject {
    static let shared = MessengerRepository()

    @Published private(set) var users: [AppUser] = []
    @Published private(set) var chats: [ChatThread] = []
    @Published private(set) var messages: [MessageEnvelope] = []

    private var userPrivateKeys: [UUID: Data] = [:]
    private var userPublicKeys: [UUID: Data] = [:]

    private let fileStore = LocalFileStore.shared
    private let crypto = CryptoService.shared

    private init() {
        load()
        if users.isEmpty {
            seedSampleUsers()
        }
    }

    func createUser(phoneNumber: String, name: String, region: String) -> AppUser {
        let user = AppUser(id: UUID(), phoneNumber: phoneNumber, displayName: name, region: region)
        users.append(user)
        let privateKey = crypto.makeIdentityPrivateKey()
        userPrivateKeys[user.id] = privateKey
        userPublicKeys[user.id] = try? crypto.derivePublicKey(from: privateKey)
        save()
        return user
    }

    func createOrGetDirectChat(between userA: UUID, and userB: UUID) -> ChatThread {
        if let existing = chats.first(where: { Set($0.participantIDs) == Set([userA, userB]) }) {
            return existing
        }
        let chat = ChatThread(id: UUID(), participantIDs: [userA, userB], title: "Direct Chat", lastMessageAt: nil)
        chats.append(chat)
        save()
        return chat
    }

    func sendMessage(chatID: UUID, senderID: UUID, recipientID: UUID, plaintext: String) throws {
        guard
            let senderPrivate = userPrivateKeys[senderID],
            let recipientPublic = userPublicKeys[recipientID]
        else { return }

        let symmetricKey = try crypto.deriveSharedSecret(
            ownPrivateKeyData: senderPrivate,
            peerPublicKeyData: recipientPublic
        )

        let encrypted = try crypto.encrypt(plaintext, using: symmetricKey)
        let envelope = MessageEnvelope(
            id: UUID(),
            chatID: chatID,
            senderID: senderID,
            recipientID: recipientID,
            encryptedPayload: encrypted.payload,
            nonce: encrypted.nonce,
            sentAt: Date()
        )
        messages.append(envelope)

        if let index = chats.firstIndex(where: { $0.id == chatID }) {
            chats[index].lastMessageAt = envelope.sentAt
        }

        save()
    }

    func decryptedMessages(for chatID: UUID, forUser userID: UUID) -> [DecryptedMessage] {
        messages
            .filter { $0.chatID == chatID }
            .compactMap { envelope in
                do {
                    let peerID = envelope.senderID == userID ? envelope.recipientID : envelope.senderID
                    guard
                        let ownPrivate = userPrivateKeys[userID],
                        let peerPublic = userPublicKeys[peerID]
                    else { return nil }

                    let symmetricKey = try crypto.deriveSharedSecret(
                        ownPrivateKeyData: ownPrivate,
                        peerPublicKeyData: peerPublic
                    )
                    let text = try crypto.decrypt(payload: envelope.encryptedPayload, using: symmetricKey)
                    return DecryptedMessage(
                        id: envelope.id,
                        chatID: envelope.chatID,
                        senderID: envelope.senderID,
                        text: text,
                        sentAt: envelope.sentAt
                    )
                } catch {
                    return nil
                }
            }
            .sorted(by: { $0.sentAt < $1.sentAt })
    }

    private func load() {
        users = (try? fileStore.read([AppUser].self, from: "users.json")) ?? []
        chats = (try? fileStore.read([ChatThread].self, from: "chats.json")) ?? []
        messages = (try? fileStore.read([MessageEnvelope].self, from: "messages.json")) ?? []
    }

    private func save() {
        try? fileStore.write(users, to: "users.json")
        try? fileStore.write(chats, to: "chats.json")
        try? fileStore.write(messages, to: "messages.json")
    }

    private func seedSampleUsers() {
        let alice = createUser(phoneNumber: "+14155550101", name: "Alice", region: "San Francisco")
        let bob = createUser(phoneNumber: "+14155550102", name: "Bob", region: "New York")
        _ = createOrGetDirectChat(between: alice.id, and: bob.id)
    }
}

import Foundation
import CryptoKit

final class MessengerRepository: ObservableObject {
    static let shared = MessengerRepository()

    @Published private(set) var users: [AppUser] = []
    @Published private(set) var chats: [ChatThread] = []
    @Published private(set) var messages: [MessageEnvelope] = []

    private var userPrivateKeys: [UUID: Data] = [:]
    private var userPublicKeys: [UUID: Data] = [:]
    private var userSigningPrivateKeys: [UUID: Data] = [:]
    private var userSigningPublicKeys: [UUID: Data] = [:]

    private let fileStore = LocalFileStore.shared
    private let crypto = CryptoService.shared
    private let keychain = KeychainService.shared

    private init() {
        load()
        if users.isEmpty {
            seedSampleUsers()
        }
    }

    func createUser(phoneNumber: String, name: String, region: String) -> AppUser {
        let user = AppUser(id: UUID(), phoneNumber: phoneNumber, displayName: name, region: region)
        users.append(user)

        let kaPrivate = crypto.makeIdentityPrivateKey()
        let sigPrivate = crypto.makeSigningPrivateKey()
        userPrivateKeys[user.id] = kaPrivate
        userSigningPrivateKeys[user.id] = sigPrivate

        userPublicKeys[user.id] = try? crypto.derivePublicKey(from: kaPrivate)
        userSigningPublicKeys[user.id] = try? crypto.deriveSigningPublicKey(from: sigPrivate)

        try? keychain.set(kaPrivate, account: "ka-private-\(user.id.uuidString)")
        try? keychain.set(sigPrivate, account: "sig-private-\(user.id.uuidString)")

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
            let recipientPublic = userPublicKeys[recipientID],
            let senderSigningPrivate = userSigningPrivateKeys[senderID],
            let senderSigningPublic = userSigningPublicKeys[senderID]
        else { return }

        let symmetricKey = try crypto.deriveSharedSecret(ownPrivateKeyData: senderPrivate, peerPublicKeyData: recipientPublic)
        let aad = makeAAD(chatID: chatID, senderID: senderID, recipientID: recipientID)
        let encrypted = try crypto.encrypt(plaintext, using: symmetricKey, authenticatedContext: aad)

        let sentAt = Date()
        let toSign = signablePayload(chatID: chatID, senderID: senderID, recipientID: recipientID, sentAt: sentAt, encryptedPayload: encrypted.payload)
        let signature = try crypto.sign(toSign, signingPrivateKey: senderSigningPrivate)

        let envelope = MessageEnvelope(
            id: UUID(),
            chatID: chatID,
            senderID: senderID,
            recipientID: recipientID,
            protocolVersion: 1,
            senderSigningPublicKey: senderSigningPublic,
            encryptedPayload: encrypted.payload,
            nonce: encrypted.nonce,
            sentAt: sentAt,
            signature: signature
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

                    let signedPayload = signablePayload(
                        chatID: envelope.chatID,
                        senderID: envelope.senderID,
                        recipientID: envelope.recipientID,
                        sentAt: envelope.sentAt,
                        encryptedPayload: envelope.encryptedPayload
                    )

                    guard crypto.verify(signature: envelope.signature, payload: signedPayload, signerPublicKey: envelope.senderSigningPublicKey) else {
                        return nil
                    }

                    let symmetricKey = try crypto.deriveSharedSecret(ownPrivateKeyData: ownPrivate, peerPublicKeyData: peerPublic)
                    let aad = makeAAD(chatID: envelope.chatID, senderID: envelope.senderID, recipientID: envelope.recipientID)
                    let text = try crypto.decrypt(payload: envelope.encryptedPayload, using: symmetricKey, authenticatedContext: aad)

                    return DecryptedMessage(id: envelope.id, chatID: envelope.chatID, senderID: envelope.senderID, text: text, sentAt: envelope.sentAt)
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

        for user in users {
            if let ka = try? keychain.get(account: "ka-private-\(user.id.uuidString)") {
                userPrivateKeys[user.id] = ka
                userPublicKeys[user.id] = try? crypto.derivePublicKey(from: ka)
            }
            if let sig = try? keychain.get(account: "sig-private-\(user.id.uuidString)") {
                userSigningPrivateKeys[user.id] = sig
                userSigningPublicKeys[user.id] = try? crypto.deriveSigningPublicKey(from: sig)
            }
        }
    }

    private func save() {
        try? fileStore.write(users, to: "users.json")
        try? fileStore.write(chats, to: "chats.json")
        try? fileStore.write(messages, to: "messages.json")
    }

    private func makeAAD(chatID: UUID, senderID: UUID, recipientID: UUID) -> Data {
        Data("\(chatID.uuidString)|\(senderID.uuidString)|\(recipientID.uuidString)|v1".utf8)
    }

    private func signablePayload(chatID: UUID, senderID: UUID, recipientID: UUID, sentAt: Date, encryptedPayload: Data) -> Data {
        var payload = Data("\(chatID.uuidString)|\(senderID.uuidString)|\(recipientID.uuidString)|\(sentAt.timeIntervalSince1970)|v1".utf8)
        payload.append(encryptedPayload)
        return payload
    }

    private func seedSampleUsers() {
        let alice = createUser(phoneNumber: "+14155550101", name: "Alice", region: "San Francisco")
        let bob = createUser(phoneNumber: "+14155550102", name: "Bob", region: "New York")
        _ = createOrGetDirectChat(between: alice.id, and: bob.id)
    }
}

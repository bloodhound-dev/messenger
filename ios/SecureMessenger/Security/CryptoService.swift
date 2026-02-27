import Foundation
import CryptoKit

enum CryptoError: Error {
    case invalidPrivateKey
    case invalidPublicKey
    case encryptionFailed
    case decryptionFailed
}

final class CryptoService {
    static let shared = CryptoService()

    private init() {}

    func makeIdentityPrivateKey() -> Data {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        return privateKey.rawRepresentation
    }

    func derivePublicKey(from privateKeyData: Data) throws -> Data {
        let privateKey = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: privateKeyData)
        return privateKey.publicKey.rawRepresentation
    }

    func deriveSharedSecret(
        ownPrivateKeyData: Data,
        peerPublicKeyData: Data
    ) throws -> SymmetricKey {
        let privateKey = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: ownPrivateKeyData)
        let peerPublicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: peerPublicKeyData)

        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: peerPublicKey)
        let key = sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data("secure-messenger-salt".utf8),
            sharedInfo: Data("p2p-chat".utf8),
            outputByteCount: 32
        )
        return key
    }

    func encrypt(_ plaintext: String, using symmetricKey: SymmetricKey) throws -> (payload: Data, nonce: Data) {
        let nonce = AES.GCM.Nonce()
        let sealedBox = try AES.GCM.seal(Data(plaintext.utf8), using: symmetricKey, nonce: nonce)
        guard let combined = sealedBox.combined else {
            throw CryptoError.encryptionFailed
        }
        return (payload: combined, nonce: Data(nonce))
    }

    func decrypt(payload: Data, using symmetricKey: SymmetricKey) throws -> String {
        let sealedBox = try AES.GCM.SealedBox(combined: payload)
        let data = try AES.GCM.open(sealedBox, using: symmetricKey)
        guard let plaintext = String(data: data, encoding: .utf8) else {
            throw CryptoError.decryptionFailed
        }
        return plaintext
    }
}

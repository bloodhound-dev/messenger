import Foundation
import CryptoKit

enum CryptoError: Error {
    case invalidPrivateKey
    case invalidPublicKey
    case encryptionFailed
    case decryptionFailed
    case signatureInvalid
}

final class CryptoService {
    static let shared = CryptoService()

    private init() {}

    func makeIdentityPrivateKey() -> Data {
        Curve25519.KeyAgreement.PrivateKey().rawRepresentation
    }

    func derivePublicKey(from privateKeyData: Data) throws -> Data {
        let privateKey = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: privateKeyData)
        return privateKey.publicKey.rawRepresentation
    }

    func makeSigningPrivateKey() -> Data {
        Curve25519.Signing.PrivateKey().rawRepresentation
    }

    func deriveSigningPublicKey(from privateKeyData: Data) throws -> Data {
        let privateKey = try Curve25519.Signing.PrivateKey(rawRepresentation: privateKeyData)
        return privateKey.publicKey.rawRepresentation
    }

    func deriveSharedSecret(ownPrivateKeyData: Data, peerPublicKeyData: Data) throws -> SymmetricKey {
        let privateKey = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: ownPrivateKeyData)
        let peerPublicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: peerPublicKeyData)

        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: peerPublicKey)
        return sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data("secure-messenger-v1-salt".utf8),
            sharedInfo: Data("secure-messenger-chat-key".utf8),
            outputByteCount: 32
        )
    }

    func encrypt(_ plaintext: String, using symmetricKey: SymmetricKey, authenticatedContext: Data) throws -> (payload: Data, nonce: Data) {
        let nonce = AES.GCM.Nonce()
        let sealedBox = try AES.GCM.seal(Data(plaintext.utf8), using: symmetricKey, nonce: nonce, authenticating: authenticatedContext)
        guard let combined = sealedBox.combined else { throw CryptoError.encryptionFailed }
        return (combined, Data(nonce))
    }

    func decrypt(payload: Data, using symmetricKey: SymmetricKey, authenticatedContext: Data) throws -> String {
        let sealedBox = try AES.GCM.SealedBox(combined: payload)
        let data = try AES.GCM.open(sealedBox, using: symmetricKey, authenticating: authenticatedContext)
        guard let plaintext = String(data: data, encoding: .utf8) else {
            throw CryptoError.decryptionFailed
        }
        return plaintext
    }

    func sign(_ data: Data, signingPrivateKey: Data) throws -> Data {
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: signingPrivateKey)
        return try key.signature(for: data)
    }

    func verify(signature: Data, payload: Data, signerPublicKey: Data) -> Bool {
        guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: signerPublicKey) else {
            return false
        }
        return key.isValidSignature(signature, for: payload)
    }
}

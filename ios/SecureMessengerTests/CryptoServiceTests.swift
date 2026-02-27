import XCTest
import CryptoKit
@testable import SecureMessenger

final class CryptoServiceTests: XCTestCase {
    func testSharedSecretRoundTripEncryptDecrypt() throws {
        let sut = CryptoService.shared

        let alicePrivate = sut.makeIdentityPrivateKey()
        let bobPrivate = sut.makeIdentityPrivateKey()
        let alicePublic = try sut.derivePublicKey(from: alicePrivate)
        let bobPublic = try sut.derivePublicKey(from: bobPrivate)

        let aliceShared = try sut.deriveSharedSecret(ownPrivateKeyData: alicePrivate, peerPublicKeyData: bobPublic)
        let bobShared = try sut.deriveSharedSecret(ownPrivateKeyData: bobPrivate, peerPublicKeyData: alicePublic)

        let plaintext = "hello encrypted world"
        let aad = Data("chat-aad".utf8)
        let encrypted = try sut.encrypt(plaintext, using: aliceShared, authenticatedContext: aad)
        let decrypted = try sut.decrypt(payload: encrypted.payload, using: bobShared, authenticatedContext: aad)

        XCTAssertEqual(decrypted, plaintext)
    }

    func testDecryptFailsWithWrongAad() throws {
        let sut = CryptoService.shared

        let alicePrivate = sut.makeIdentityPrivateKey()
        let bobPrivate = sut.makeIdentityPrivateKey()
        let bobPublic = try sut.derivePublicKey(from: bobPrivate)

        let aliceToBob = try sut.deriveSharedSecret(ownPrivateKeyData: alicePrivate, peerPublicKeyData: bobPublic)
        let encrypted = try sut.encrypt("secret", using: aliceToBob, authenticatedContext: Data("right".utf8))

        XCTAssertThrowsError(try sut.decrypt(payload: encrypted.payload, using: aliceToBob, authenticatedContext: Data("wrong".utf8)))
    }

    func testSignAndVerify() throws {
        let sut = CryptoService.shared
        let priv = sut.makeSigningPrivateKey()
        let pub = try sut.deriveSigningPublicKey(from: priv)
        let payload = Data("message".utf8)

        let signature = try sut.sign(payload, signingPrivateKey: priv)

        XCTAssertTrue(sut.verify(signature: signature, payload: payload, signerPublicKey: pub))
    }
}

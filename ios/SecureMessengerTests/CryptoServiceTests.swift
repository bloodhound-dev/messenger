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
        let encrypted = try sut.encrypt(plaintext, using: aliceShared)
        let decrypted = try sut.decrypt(payload: encrypted.payload, using: bobShared)

        XCTAssertEqual(decrypted, plaintext)
    }

    func testDecryptFailsWithWrongKey() throws {
        let sut = CryptoService.shared

        let alicePrivate = sut.makeIdentityPrivateKey()
        let bobPrivate = sut.makeIdentityPrivateKey()
        let charliePrivate = sut.makeIdentityPrivateKey()

        let bobPublic = try sut.derivePublicKey(from: bobPrivate)
        let charliePublic = try sut.derivePublicKey(from: charliePrivate)

        let aliceToBob = try sut.deriveSharedSecret(ownPrivateKeyData: alicePrivate, peerPublicKeyData: bobPublic)
        let aliceToCharlie = try sut.deriveSharedSecret(ownPrivateKeyData: alicePrivate, peerPublicKeyData: charliePublic)

        let encrypted = try sut.encrypt("secret", using: aliceToBob)

        XCTAssertThrowsError(try sut.decrypt(payload: encrypted.payload, using: aliceToCharlie))
    }
}

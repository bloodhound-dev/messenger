import XCTest
@testable import SecureMessenger

final class AuthServiceTests: XCTestCase {
    func testOTPVerificationSucceedsWithCorrectCode() {
        let sut = AuthService.shared
        let phone = "+14155550111"

        let otp = sut.requestOTP(for: phone)
        let result = sut.verifyOTP(phoneNumber: phone, code: otp)

        XCTAssertTrue(result)
    }

    func testOTPVerificationFailsWithIncorrectCode() {
        let sut = AuthService.shared
        let phone = "+14155550112"

        _ = sut.requestOTP(for: phone)
        let result = sut.verifyOTP(phoneNumber: phone, code: "000000")

        XCTAssertFalse(result)
    }

    func testOTPIsSingleUse() {
        let sut = AuthService.shared
        let phone = "+14155550113"

        let otp = sut.requestOTP(for: phone)
        let first = sut.verifyOTP(phoneNumber: phone, code: otp)
        let second = sut.verifyOTP(phoneNumber: phone, code: otp)

        XCTAssertTrue(first)
        XCTAssertFalse(second)
    }
}

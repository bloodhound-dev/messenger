import Foundation
import CoreLocation

struct AppUser: Codable, Identifiable, Hashable {
    let id: UUID
    var phoneNumber: String
    var displayName: String
    var region: String
}

struct ChatThread: Codable, Identifiable, Hashable {
    let id: UUID
    let participantIDs: [UUID]
    var title: String
    var lastMessageAt: Date?
}

struct MessageEnvelope: Codable, Identifiable, Hashable {
    let id: UUID
    let chatID: UUID
    let senderID: UUID
    let recipientID: UUID
    let protocolVersion: Int
    let senderSigningPublicKey: Data
    let encryptedPayload: Data
    let nonce: Data
    let sentAt: Date
    let signature: Data
}

struct DecryptedMessage: Identifiable, Hashable {
    let id: UUID
    let chatID: UUID
    let senderID: UUID
    let text: String
    let sentAt: Date
}

struct TelemetrySample: Codable, Identifiable, Hashable {
    let id: UUID
    let timestamp: Date
    let sentBytes: Int
    let receivedBytes: Int
    let activeUsers: Int
    let location: LocationPoint
}

struct LocationPoint: Codable, Hashable {
    let latitude: Double
    let longitude: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

struct RegionUserCount: Identifiable, Hashable {
    let id = UUID()
    let region: String
    let count: Int
    let coordinate: CLLocationCoordinate2D
}

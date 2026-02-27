import Foundation
import MapKit

final class TelemetryService: ObservableObject {
    static let shared = TelemetryService()

    @Published private(set) var samples: [TelemetrySample] = []

    private let fileStore = LocalFileStore.shared

    private init() {
        load()
        if samples.isEmpty {
            seedTelemetry()
        }
    }

    func append(sentBytes: Int, receivedBytes: Int, activeUsers: Int, location: LocationPoint) {
        let sample = TelemetrySample(
            id: UUID(),
            timestamp: Date(),
            sentBytes: sentBytes,
            receivedBytes: receivedBytes,
            activeUsers: activeUsers,
            location: location
        )
        samples.append(sample)
        save()
    }

    var totalSent: Int { samples.reduce(0) { $0 + $1.sentBytes } }
    var totalReceived: Int { samples.reduce(0) { $0 + $1.receivedBytes } }
    var maxConcurrentUsers: Int { samples.map(\.activeUsers).max() ?? 0 }

    var regionUserCounts: [RegionUserCount] {
        [
            RegionUserCount(region: "SF", count: 120, coordinate: .init(latitude: 37.7749, longitude: -122.4194)),
            RegionUserCount(region: "NY", count: 200, coordinate: .init(latitude: 40.7128, longitude: -74.0060)),
            RegionUserCount(region: "LDN", count: 160, coordinate: .init(latitude: 51.5074, longitude: -0.1278))
        ]
    }

    private func load() {
        samples = (try? fileStore.read([TelemetrySample].self, from: "telemetry.json")) ?? []
    }

    private func save() {
        try? fileStore.write(samples, to: "telemetry.json")
    }

    private func seedTelemetry() {
        let seed: [TelemetrySample] = [
            .init(id: UUID(), timestamp: Date().addingTimeInterval(-3600), sentBytes: 18_000, receivedBytes: 12_000, activeUsers: 75, location: .init(latitude: 37.7749, longitude: -122.4194)),
            .init(id: UUID(), timestamp: Date().addingTimeInterval(-1800), sentBytes: 22_000, receivedBytes: 17_000, activeUsers: 98, location: .init(latitude: 40.7128, longitude: -74.0060)),
            .init(id: UUID(), timestamp: Date(), sentBytes: 30_000, receivedBytes: 28_000, activeUsers: 130, location: .init(latitude: 51.5074, longitude: -0.1278))
        ]
        samples = seed
        save()
    }
}

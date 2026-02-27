import SwiftUI
import MapKit

struct DashboardView: View {
    @ObservedObject var telemetry: TelemetryService

    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Traffic & Usage Dashboard")
                    .font(.title2)
                    .fontWeight(.bold)

                HStack {
                    metricCard(title: "Sent", value: "\(telemetry.totalSent) bytes")
                    metricCard(title: "Received", value: "\(telemetry.totalReceived) bytes")
                }

                metricCard(title: "Peak Active Users", value: "\(telemetry.maxConcurrentUsers)")

                Text("Telemetry Samples")
                    .font(.headline)

                ForEach(telemetry.samples.suffix(10).reversed()) { sample in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(sample.timestamp.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Sent: \(sample.sentBytes), Received: \(sample.receivedBytes), Active: \(sample.activeUsers)")
                            .font(.subheadline)
                    }
                    .padding(.vertical, 6)
                }

                Text("Global User Count Map")
                    .font(.headline)

                Map(position: $cameraPosition) {
                    ForEach(telemetry.regionUserCounts) { item in
                        Annotation(item.region, coordinate: item.coordinate) {
                            VStack(spacing: 4) {
                                Image(systemName: "person.3.fill")
                                    .foregroundStyle(.blue)
                                Text("\(item.count)")
                                    .font(.caption2)
                                    .padding(4)
                                    .background(Color.white.opacity(0.9))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
                .frame(height: 320)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding()
        }
    }

    @ViewBuilder
    private func metricCard(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.gray.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

import Foundation

final class LocalFileStore {
    static let shared = LocalFileStore()

    private let fm = FileManager.default

    private init() {}

    private func documentsDirectory() -> URL {
        fm.urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    func write<T: Encodable>(_ value: T, to filename: String) throws {
        let fileURL = documentsDirectory().appendingPathComponent(filename)
        let data = try JSONEncoder.pretty.encode(value)
        try data.write(to: fileURL, options: [.atomic])
    }

    func read<T: Decodable>(_ type: T.Type, from filename: String) throws -> T {
        let fileURL = documentsDirectory().appendingPathComponent(filename)
        let data = try Data(contentsOf: fileURL)
        return try JSONDecoder.standard.decode(T.self, from: data)
    }

    func exists(_ filename: String) -> Bool {
        let fileURL = documentsDirectory().appendingPathComponent(filename)
        return fm.fileExists(atPath: fileURL.path)
    }
}

private extension JSONEncoder {
    static var pretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var standard: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

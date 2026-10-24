import Foundation

public enum JSONCoding {
    /// For the server and Claude APIs, which use snake_case keys.
    public static var apiDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }

    public static var apiEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    /// For the phone's own store file. Dates use the default encoding, which keeps them exact.
    public static var storeEncoder: JSONEncoder { JSONEncoder() }
    public static var storeDecoder: JSONDecoder { JSONDecoder() }
}

/// ISO 8601 timestamps as the server writes them (`2026-10-13T12:14:00.000Z`).
public enum ISOTime {
    public static func string(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    public static func parse(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
}

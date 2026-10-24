import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Requests to the home server (README: reached over the tailnet, e.g. `https://host.tailnet.ts.net`).
public struct ServerAPI: Sendable {
    public var baseURL: URL

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    /// Reads a server address as typed in Settings: adds `https://` when there's no scheme and drops a trailing slash.
    public static func baseURL(from text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard !trimmed.isEmpty else { return nil }
        if !trimmed.contains("://") { trimmed = "https://" + trimmed }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http", url.host != nil
        else { return nil }
        return url
    }

    func request(
        _ method: String, _ path: String, query: [URLQueryItem] = [], body: Data? = nil, timeout: TimeInterval = 15
    ) -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        return request
    }

    /// The reachability check: short, so being off the tailnet is noticed quickly.
    public func health() -> URLRequest { request("GET", "api/health", timeout: 5) }
    func day(_ date: String) -> URLRequest { request("GET", "api/day/\(date)") }
    func settings() -> URLRequest { request("GET", "api/settings") }
    func weights(_ range: TrendRange) -> URLRequest { request("GET", "api/weights", query: [.init(name: "range", value: range.rawValue)]) }
    func calories(_ range: TrendRange) -> URLRequest { request("GET", "api/calories", query: [.init(name: "range", value: range.rawValue)]) }

    // Request bodies, encoded with snake_case keys.
    private struct SyncItemBody: Encodable {
        var name, portion: String
        var calories: Int
        var proteinG, carbsG, fatG: Double
        var confidence: Confidence
        var assumption: String?
        var edited: Bool

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(name, forKey: .name)
            try c.encode(portion, forKey: .portion)
            try c.encode(calories, forKey: .calories)
            try c.encode(proteinG, forKey: .proteinG)
            try c.encode(carbsG, forKey: .carbsG)
            try c.encode(fatG, forKey: .fatG)
            try c.encode(confidence, forKey: .confidence)
            // The server wants an explicit null, not a missing key.
            try c.encode(assumption, forKey: .assumption)
            try c.encode(edited, forKey: .edited)
        }

        enum CodingKeys: CodingKey { case name, portion, calories, proteinG, carbsG, fatG, confidence, assumption, edited }
    }

    private struct SyncEntryBody: Encodable {
        var date, loggedAt: String
        var mealType: MealType
        var text, model, modelResponse: String
        var inputTokens, outputTokens: Int
        var items: [SyncItemBody]
    }

    private struct CreateEntryBody: Encodable {
        var text, date, clientId, loggedAt: String
        var mealType: MealType?
    }

    private struct SyncBurnBody: Encodable {
        var date, loggedAt: String
        var calories: Int
        var note: String?

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(date, forKey: .date)
            try c.encode(loggedAt, forKey: .loggedAt)
            try c.encode(calories, forKey: .calories)
            try c.encode(note, forKey: .note)
        }

        enum CodingKeys: CodingKey { case date, loggedAt, calories, note }
    }

    private struct WeightBody: Encodable { var weightLb: Double }
    private struct MealTypeBody: Encodable { var mealType: MealType }

    private func json<T: Encodable>(_ value: T) throws -> Data { try JSONCoding.apiEncoder.encode(value) }
    private static func clientId(_ uuid: UUID) -> String { uuid.uuidString.lowercased() }

    /// The request that uploads one queued change.
    func request(for op: PendingOp) throws -> URLRequest {
        switch op {
        case let .createEntry(e):
            let body = SyncEntryBody(
                date: e.date, loggedAt: ISOTime.string(e.loggedAt), mealType: e.mealType, text: e.text, model: e.model,
                modelResponse: e.modelResponse, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
                items: e.items.map {
                    SyncItemBody(
                        name: $0.name, portion: $0.portion, calories: $0.calories, proteinG: $0.proteinG,
                        carbsG: $0.carbsG, fatG: $0.fatG, confidence: $0.confidence, assumption: $0.assumption,
                        edited: $0.edited
                    )
                }
            )
            return request("PUT", "api/sync/entries/\(Self.clientId(e.clientId))", body: try json(body))
        case let .queueText(q):
            let body = CreateEntryBody(
                text: q.text, date: q.date, clientId: Self.clientId(q.clientId), loggedAt: ISOTime.string(q.loggedAt),
                mealType: q.mealType
            )
            // The server calls Claude before it answers.
            return request("POST", "api/entries", body: try json(body), timeout: 90)
        case let .createBurn(b):
            let body = SyncBurnBody(date: b.date, loggedAt: ISOTime.string(b.loggedAt), calories: b.calories, note: b.note)
            return request("PUT", "api/sync/burns/\(Self.clientId(b.clientId))", body: try json(body))
        case let .putWeight(date, lb):
            return request("PUT", "api/weights/\(date)", body: try json(WeightBody(weightLb: lb)))
        case let .deleteWeight(date):
            return request("DELETE", "api/weights/\(date)")
        case let .patchItem(id, patch):
            return request("PATCH", "api/items/\(id)", body: try json(patch))
        case let .deleteItem(id):
            return request("DELETE", "api/items/\(id)")
        case let .patchEntry(id, mealType):
            return request("PATCH", "api/entries/\(id)", body: try json(MealTypeBody(mealType: mealType)))
        case let .deleteEntry(id):
            return request("DELETE", "api/entries/\(id)")
        case let .patchBurn(id, patch):
            return request("PATCH", "api/burns/\(id)", body: try json(patch))
        case let .deleteBurn(id):
            return request("DELETE", "api/burns/\(id)")
        case let .putGoals(goals):
            return request("PUT", "api/settings", body: try json(goals))
        }
    }

    enum Outcome: Equatable {
        case done
        /// The record it targets no longer exists on the server.
        case gone
        /// Refused (4xx): retrying the same request won't help.
        case rejected(String)
        /// A server error (5xx): worth retrying later.
        case serverError(String)
    }

    private struct ErrorBody: Decodable {
        var reason: String?
        var error: String?
    }

    static func outcome(for op: PendingOp, status: Int, data: Data) -> Outcome {
        let body = try? JSONCoding.apiDecoder.decode(ErrorBody.self, from: data)
        let reason = body?.reason ?? body?.error ?? "HTTP \(status)"
        switch status {
        case 200..<300:
            return .done
        case 404:
            switch op {
            case .createEntry, .createBurn, .queueText, .putWeight, .putGoals:
                // A route the server doesn't have: it predates the iOS app's sync endpoints.
                return .rejected("The server is out of date. Update it: git pull && docker compose up -d --build")
            default:
                return .gone
            }
        case 400..<500:
            return .rejected(reason)
        default:
            return .serverError(reason)
        }
    }
}

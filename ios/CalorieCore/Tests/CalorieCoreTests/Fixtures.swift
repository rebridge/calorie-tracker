import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import CalorieCore

/// New York, so dates and times match the server tests.
let newYork: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/New_York")!
    return calendar
}()

/// 08:14 in New York on Tue Oct 13 2026.
let morning = ISOTime.parse("2026-10-13T12:14:00Z")!

func localItem(_ name: String, _ calories: Int, id: UUID = UUID()) -> LocalItem {
    LocalItem(id: id, name: name, portion: "1", calories: calories, proteinG: 1, carbsG: 2, fatG: 3, confidence: .high, assumption: nil)
}

func localEntry(_ items: [LocalItem], date: String = "2026-10-13", clientId: UUID = UUID(), meal: MealType = .breakfast) -> LocalEntry {
    LocalEntry(
        clientId: clientId, date: date, loggedAt: morning, mealType: meal, text: "eggs", model: "claude-haiku-5-5",
        modelResponse: "{\"id\":\"msg\"}", inputTokens: 10, outputTokens: 20, items: items
    )
}

func serverItem(_ id: Int, entry: Int, _ name: String, _ calories: Int) -> ServerItem {
    ServerItem(
        id: id, entryId: entry, name: name, portion: "1", calories: calories, proteinG: 1, carbsG: 2, fatG: 3,
        confidence: .high, assumption: nil, edited: false
    )
}

func serverEntry(_ id: Int, date: String = "2026-10-13", meal: MealType = .lunch, createdAt: String = "2026-10-13T16:00:00.000Z", items: [ServerItem]) -> ServerEntry {
    ServerEntry(id: id, createdAt: createdAt, localDate: date, mealType: meal, rawText: "server entry", items: items)
}

func cachedDay(_ date: String = "2026-10-13", entries: [ServerEntry] = [], burns: [ServerBurn] = [], weight: Double? = nil) -> CachedDay {
    var day = CachedDay(date: date)
    day.entries = entries
    day.burns = burns
    day.weight = weight.map { ServerWeight(weightLb: $0, createdAt: "2026-10-13T11:00:00.000Z") }
    day.fetchedAt = morning
    return day
}

/// JSON for a server entry, the way the API returns it.
func entryJSON(_ id: Int, date: String = "2026-10-13", meal: String = "breakfast", itemIds: [Int], calories: [Int]? = nil) -> [String: Any] {
    [
        "id": id, "created_at": "2026-10-13T12:14:00.000Z", "local_date": date, "meal_type": meal, "raw_text": "eggs",
        "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0,
        "items": itemIds.enumerated().map { i, itemId in
            [
                "id": itemId, "entry_id": id, "name": "Item \(i)", "portion": "1", "calories": calories?[i] ?? 100,
                "protein_g": 1, "carbs_g": 2, "fat_g": 3, "confidence": "high", "assumption": NSNull(), "edited": false,
            ] as [String: Any]
        },
    ]
}

func dayJSON(_ date: String, entries: [[String: Any]] = [], calorieGoal: Int = 1800) -> [String: Any] {
    [
        "date": date,
        "meals": ["breakfast", "lunch", "dinner", "snack"].map { (meal: String) -> [String: Any] in
            ["meal_type": meal, "calories": 0, "entries": entries.filter { ($0["meal_type"] as? String) == meal }]
        },
        "burns": [] as [Any],
        "weight": NSNull(),
        "goals": ["calorie_goal": calorieGoal, "protein_goal_g": 150, "carbs_goal_g": 200, "fat_goal_g": 65],
        "totals": ["eaten_kcal": 0, "burned_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0],
    ]
}

/// A scripted server. `routes` answers "METHOD /path"; anything else is a 404 like the real server's.
final class FakeServer: HTTPTransport, @unchecked Sendable {
    struct Reply {
        var status: Int
        var body: Any
    }

    var reachable = true
    var routes: [String: (URLRequest) -> Reply] = [:]
    /// Runs on the main actor while a matching request is "in flight", before its reply is returned.
    var whileInFlight: [String: @MainActor () -> Void] = [:]
    /// Fails requests to these routes as if the connection dropped.
    var dropConnection: Set<String> = []
    private(set) var log: [String] = []
    private(set) var bodies: [String: [[String: Any]]] = [:]

    static func key(_ request: URLRequest) -> String {
        "\(request.httpMethod ?? "GET") \(request.url!.path)"
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let key = Self.key(request)
        log.append(key)
        if let body = request.httpBody, let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] {
            bodies[key, default: []].append(json)
        }
        guard reachable, !dropConnection.contains(key) else { throw URLError(.cannotFindHost) }
        if let hook = whileInFlight[key] {
            whileInFlight[key] = nil
            await MainActor.run { hook() }
        }
        let reply: Reply
        if key == "GET /api/health" {
            reply = Reply(status: 200, body: ["ok": true])
        } else if let route = routes[key] {
            reply = route(request)
        } else {
            reply = Reply(status: 404, body: ["error": "Not found"])
        }
        let data = try JSONSerialization.data(withJSONObject: reply.body)
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }
}

@MainActor
final class TestHost: SyncHost {
    var state = StoreState()
    var saves = 0
    func stateDidChange() { saves += 1 }
}

let api = ServerAPI(baseURL: URL(string: "https://calories.tailnet.ts.net")!)

func plan(_ dates: [String] = ["2026-10-13"], backfill: Int = 0) -> RefreshPlan {
    RefreshPlan(dates: dates, weightRange: .month, calorieRange: .month, backfillDays: backfill)
}

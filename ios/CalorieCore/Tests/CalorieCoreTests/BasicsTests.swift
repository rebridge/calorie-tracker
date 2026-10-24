import Foundation
import XCTest
@testable import CalorieCore

final class MealTimeTests: XCTestCase {
    func testSlots() {
        XCTAssertEqual(MealTime.mealType(forTime: "00:00"), .breakfast)
        XCTAssertEqual(MealTime.mealType(forTime: "10:29"), .breakfast)
        XCTAssertEqual(MealTime.mealType(forTime: "10:30"), .lunch)
        XCTAssertEqual(MealTime.mealType(forTime: "14:30"), .snack)
        XCTAssertEqual(MealTime.mealType(forTime: "17:00"), .dinner)
        XCTAssertEqual(MealTime.mealType(forTime: "20:59"), .dinner)
        XCTAssertEqual(MealTime.mealType(forTime: "21:00"), .snack)
    }

    func testResolveOrder() {
        XCTAssertEqual(MealTime.resolve(requested: .lunch, fromModel: .dinner, localTime: "08:00"), .lunch)
        XCTAssertEqual(MealTime.resolve(requested: nil, fromModel: .dinner, localTime: "08:00"), .dinner)
        XCTAssertEqual(MealTime.resolve(requested: nil, fromModel: nil, localTime: "18:05"), .dinner)
        XCTAssertEqual(MealTime.resolve(requested: nil, fromModel: nil, localTime: nil), .snack)
    }
}

final class LocalDateTests: XCTestCase {
    func testTodayAndTimeUseTheCalendarsZone() {
        // 22:30 on Oct 13 in New York is already Oct 14 in UTC.
        let late = ISOTime.parse("2026-10-14T02:30:00Z")!
        XCTAssertEqual(LocalDate.today(late, calendar: newYork), "2026-10-13")
        XCTAssertEqual(LocalDate.localTime(late, calendar: newYork), "22:30")
    }

    func testAddDaysAcrossMonthsAndDST() {
        XCTAssertEqual(LocalDate.addDays("2026-10-31", 1), "2026-11-01")
        XCTAssertEqual(LocalDate.addDays("2026-11-02", -2), "2026-10-31")
        XCTAssertEqual(LocalDate.addDays("2026-03-08", 1), "2026-03-09")
        XCTAssertEqual(LocalDate.addDays("2024-02-28", 1), "2024-02-29")
    }

    func testLabels() {
        XCTAssertEqual(LocalDate.dayLabel("2026-10-13", today: "2026-10-13"), "Today")
        XCTAssertEqual(LocalDate.dayLabel("2026-10-12", today: "2026-10-13"), "Yesterday")
        XCTAssertEqual(LocalDate.dayLabel("2026-10-05", today: "2026-10-13"), "Mon, Oct 5")
        XCTAssertEqual(LocalDate.shortLabel("2025-12-31", today: "2026-10-13"), "Wed, Dec 31, 2025")
    }

    func testISOTimeReadsTheServersFormat() {
        XCTAssertEqual(ISOTime.parse("2026-10-13T12:14:00.000Z"), morning)
        XCTAssertEqual(ISOTime.parse("2026-10-13T12:14:00Z"), morning)
        XCTAssertEqual(ISOTime.string(morning), "2026-10-13T12:14:00.000Z")
    }
}

final class ServerAPITests: XCTestCase {
    func testBaseURLFromTypedText() {
        XCTAssertEqual(ServerAPI.baseURL(from: " host.tailnet.ts.net/ ")?.absoluteString, "https://host.tailnet.ts.net")
        XCTAssertEqual(ServerAPI.baseURL(from: "http://100.64.0.7:8080")?.absoluteString, "http://100.64.0.7:8080")
        XCTAssertNil(ServerAPI.baseURL(from: ""))
        XCTAssertNil(ServerAPI.baseURL(from: "ftp://host"))
    }

    func testOutcomes() {
        let create = PendingOp.createBurn(LocalBurn(date: "2026-10-13", loggedAt: morning, calories: 1, note: nil))
        let notFound = Data(#"{"error":"Not found"}"#.utf8)
        XCTAssertEqual(ServerAPI.outcome(for: .deleteItem(id: 1), status: 404, data: notFound), .gone)
        XCTAssertEqual(ServerAPI.outcome(for: .patchItem(id: 1, patch: ItemPatch()), status: 404, data: notFound), .gone)
        guard case let .rejected(reason) = ServerAPI.outcome(for: create, status: 404, data: notFound) else {
            return XCTFail("a missing sync route should be refused")
        }
        XCTAssertTrue(reason.contains("out of date"))
        XCTAssertEqual(
            ServerAPI.outcome(for: create, status: 400, data: Data(#"{"error":"invalid_date","reason":"Use YYYY-MM-DD"}"#.utf8)),
            .rejected("Use YYYY-MM-DD")
        )
        XCTAssertEqual(ServerAPI.outcome(for: create, status: 502, data: Data("{}".utf8)), .serverError("HTTP 502"))
        XCTAssertEqual(ServerAPI.outcome(for: create, status: 201, data: Data()), .done)
    }

    func testItemPatchSendsOnlyTheChangedFields() throws {
        let request = try api.request(for: .patchItem(id: 7, patch: ItemPatch(calories: 250, proteinG: 12.5)))
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.url?.absoluteString, "https://calories.tailnet.ts.net/api/items/7")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(body.count, 2)
        XCTAssertEqual(body["calories"] as? Int, 250)
        XCTAssertEqual(body["protein_g"] as? Double, 12.5)
    }

    func testSyncEntryBody() throws {
        let id = UUID(uuidString: "8F14E45F-CEEA-467A-9C3B-2D7B4C1E0A11")!
        let entry = localEntry([localItem("Eggs", 140)], clientId: id)
        let request = try api.request(for: .createEntry(entry))
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.url?.path, "/api/sync/entries/8f14e45f-ceea-467a-9c3b-2d7b4c1e0a11")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(body["date"] as? String, "2026-10-13")
        XCTAssertEqual(body["logged_at"] as? String, "2026-10-13T12:14:00.000Z")
        XCTAssertEqual(body["meal_type"] as? String, "breakfast")
        XCTAssertEqual(body["model_response"] as? String, "{\"id\":\"msg\"}")
        XCTAssertEqual(body["input_tokens"] as? Int, 10)
        let item = (body["items"] as! [[String: Any]])[0]
        XCTAssertEqual(item["calories"] as? Int, 140)
        XCTAssertEqual(item["fat_g"] as? Double, 3)
        XCTAssertTrue(item["assumption"] is NSNull, "the server wants an explicit null")
        XCTAssertEqual(item["edited"] as? Bool, false)
    }

    func testQueuedTextBody() throws {
        let text = QueuedText(date: "2026-10-12", loggedAt: morning, text: "burrito", mealType: nil)
        let request = try api.request(for: .queueText(text))
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/entries")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(body["client_id"] as? String, text.clientId.uuidString.lowercased())
        XCTAssertEqual(body["logged_at"] as? String, "2026-10-13T12:14:00.000Z")
        XCTAssertNil(body["meal_type"], "no meal type means let the server decide")
    }
}

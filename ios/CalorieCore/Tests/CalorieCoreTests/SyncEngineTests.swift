import Foundation
import XCTest
@testable import CalorieCore

final class SyncEngineTests: XCTestCase {
    private let clock = { morning }

    @MainActor
    func testDoesNothingWhenTheServerIsUnreachable() async {
        let server = FakeServer()
        server.reachable = false
        let host = TestHost()
        host.state.setWeight(date: "2026-10-13", weightLb: 180)

        let report = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertEqual(report, SyncReport(reachable: false, uploaded: 0, refused: 0, message: nil))
        XCTAssertEqual(server.log, ["GET /api/health"])
        XCTAssertEqual(host.state.outbox.count, 1)
    }

    @MainActor
    func testUploadsInOrderThenRefreshes() async throws {
        let server = FakeServer()
        let host = TestHost()
        let eggs = localItem("Eggs", 140)
        let entry = localEntry([eggs])
        host.state.addEntry(entry)
        host.state.setWeight(date: "2026-10-13", weightLb: 180)
        let entryPath = "PUT /api/sync/entries/\(entry.clientId.uuidString.lowercased())"
        server.routes[entryPath] = { _ in .init(status: 201, body: entryJSON(41, itemIds: [410])) }
        server.routes["PUT /api/weights/2026-10-13"] = { _ in .init(status: 200, body: ["local_date": "2026-10-13", "weight_lb": 180, "created_at": "x"]) }
        server.routes["GET /api/day/2026-10-13"] = { _ in .init(status: 200, body: dayJSON("2026-10-13", entries: [entryJSON(41, itemIds: [410])])) }

        let report = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertEqual(report, SyncReport(reachable: true, uploaded: 2, refused: 0, message: nil))
        XCTAssertEqual(Array(server.log.prefix(4)), ["GET /api/health", entryPath, "PUT /api/weights/2026-10-13", "GET /api/settings"])
        XCTAssertTrue(server.log.contains("GET /api/day/2026-10-13"))
        XCTAssertTrue(server.log.contains("GET /api/weights"))
        XCTAssertTrue(server.log.contains("GET /api/calories"))
        XCTAssertTrue(host.state.outbox.isEmpty)
        XCTAssertEqual(host.state.lastSyncAt, morning)
        XCTAssertEqual(host.state.goals?.calorieGoal, 1800, "goals come back with the day")

        let row = host.state.day("2026-10-13").meals[0].entries[0]
        XCTAssertEqual(row.id, .server(41))
        XCTAssertEqual(row.items[0].id, .server(410))
        XCTAssertEqual(row.status, .synced)
    }

    @MainActor
    func testAnEditDuringTheUploadIsSentAgain() async throws {
        let server = FakeServer()
        let host = TestHost()
        let eggs = localItem("Eggs", 140)
        let entry = localEntry([eggs])
        host.state.addEntry(entry)
        let path = "PUT /api/sync/entries/\(entry.clientId.uuidString.lowercased())"
        server.routes[path] = { request in
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            let calories = ((body["items"] as! [[String: Any]])[0]["calories"] as! Int)
            return .init(status: 200, body: entryJSON(41, itemIds: [410 + calories], calories: [calories]))
        }
        server.whileInFlight[path] = { host.state.updateItem(.local(eggs.id), ItemPatch(calories: 200)) }

        _ = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertEqual(server.log.filter { $0 == path }.count, 2)
        XCTAssertEqual((server.bodies[path]![1]["items"] as! [[String: Any]])[0]["calories"] as? Int, 200)
        XCTAssertTrue(host.state.outbox.isEmpty)
        XCTAssertEqual(host.state.idMap.items[eggs.id], 610, "mapped to the item the second upload made")
    }

    @MainActor
    func testADeleteDuringTheUploadDeletesTheServersCopy() async {
        let server = FakeServer()
        let host = TestHost()
        let entry = localEntry([localItem("Eggs", 140)])
        host.state.addEntry(entry)
        let path = "PUT /api/sync/entries/\(entry.clientId.uuidString.lowercased())"
        server.routes[path] = { _ in .init(status: 201, body: entryJSON(41, itemIds: [410])) }
        server.routes["DELETE /api/entries/41"] = { _ in .init(status: 200, body: ["local_date": "2026-10-13"]) }
        server.whileInFlight[path] = { host.state.deleteEntry(.local(entry.clientId)) }

        _ = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertTrue(server.log.contains("DELETE /api/entries/41"))
        XCTAssertTrue(host.state.outbox.isEmpty)
        XCTAssertTrue(host.state.day("2026-10-13").meals[0].entries.isEmpty)
    }

    @MainActor
    func testRefusedChangesAreMarkedAndTheRestStillGo() async {
        let server = FakeServer()
        let host = TestHost()
        host.state.days["2026-10-13"] = cachedDay(entries: [serverEntry(1, items: [serverItem(10, entry: 1, "Rice", 200)])])
        host.state.updateItem(.server(10), ItemPatch(name: ""))
        host.state.deleteItem(.server(77))
        host.state.setGoals(Goals(calorieGoal: 2100, proteinGoalG: 1, carbsGoalG: 1, fatGoalG: 1))
        server.routes["PATCH /api/items/10"] = { _ in .init(status: 400, body: ["error": "invalid_request", "reason": "name: Too small"]) }
        server.routes["PUT /api/settings"] = { _ in .init(status: 200, body: [:]) }

        let report = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan([]), now: clock)
        XCTAssertEqual(report?.uploaded, 2, "the 404 delete counts as done, and the goals went")
        XCTAssertEqual(report?.refused, 1)
        XCTAssertEqual(host.state.outbox.map(\.failure), ["name: Too small"])
        XCTAssertEqual(host.state.goals?.calorieGoal, 2100)
    }

    @MainActor
    func testAServerErrorStopsTheRunAndIsRetriedLater() async {
        let server = FakeServer()
        let host = TestHost()
        host.state.queueText(QueuedText(date: "2026-10-13", loggedAt: morning, text: "burrito", mealType: nil))
        host.state.setWeight(date: "2026-10-13", weightLb: 180)
        server.routes["POST /api/entries"] = { _ in .init(status: 502, body: ["error": "model_error", "reason": "The model API call failed"]) }

        let engine = SyncEngine(transport: server)
        let report = await engine.sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertEqual(report?.message, "Server error: The model API call failed")
        XCTAssertFalse(server.log.contains("PUT /api/weights/2026-10-13"))
        XCTAssertEqual(host.state.outbox.count, 2)
        XCTAssertEqual(host.state.outbox[0].attempts, 1)

        for _ in 1..<StoreState.maxServerErrors { _ = await engine.sync(host: host, api: api, plan: plan(), now: clock) }
        XCTAssertEqual(host.state.outbox[0].failure, "The model API call failed", "gives up so it can't block the queue")

        server.routes["PUT /api/weights/2026-10-13"] = { _ in .init(status: 200, body: [:]) }
        _ = await engine.sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertTrue(server.log.contains("PUT /api/weights/2026-10-13"), "the next change goes once the failed one is set aside")
        XCTAssertEqual(host.state.outbox.count, 1)
    }

    @MainActor
    func testAQueuedTextIsEstimatedByTheServer() async {
        let server = FakeServer()
        let host = TestHost()
        let text = QueuedText(date: "2026-10-13", loggedAt: morning, text: "burrito", mealType: nil)
        host.state.queueText(text)
        server.routes["POST /api/entries"] = { _ in .init(status: 201, body: entryJSON(9, meal: "lunch", itemIds: [90], calories: [800])) }

        _ = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan([]), now: clock)
        let row = host.state.day("2026-10-13").meals[1].entries[0]
        XCTAssertEqual(row.id, .server(9))
        XCTAssertEqual(row.calories, 800)
        XCTAssertEqual(host.state.idMap.entries[text.clientId], 9)
    }

    @MainActor
    func testAnOutOfDateServerRefusesTheUploadWithAHint() async {
        let server = FakeServer()
        let host = TestHost()
        host.state.addBurn(LocalBurn(date: "2026-10-13", loggedAt: morning, calories: 300, note: nil))
        _ = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan([]), now: clock)
        XCTAssertEqual(host.state.outbox[0].failure?.contains("docker compose"), true)
        XCTAssertEqual(host.state.day("2026-10-13").burns.first?.status.isFailed, true)
    }

    @MainActor
    func testLosingTheConnectionMidRunKeepsTheChange() async {
        let server = FakeServer()
        let host = TestHost()
        host.state.setWeight(date: "2026-10-13", weightLb: 180)
        server.dropConnection = ["PUT /api/weights/2026-10-13"]
        let report = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan(), now: clock)
        XCTAssertEqual(report?.reachable, false)
        XCTAssertEqual(host.state.outbox.count, 1)
        XCTAssertNil(host.state.outbox[0].failure)
    }

    @MainActor
    func testBackfillsRecentDaysItHasNeverLoaded() async {
        let server = FakeServer()
        let host = TestHost()
        host.state.days["2026-10-12"] = cachedDay("2026-10-12")
        for date in ["2026-10-13", "2026-10-11"] {
            server.routes["GET /api/day/\(date)"] = { _ in .init(status: 200, body: dayJSON(date)) }
        }
        _ = await SyncEngine(transport: server).sync(host: host, api: api, plan: plan([], backfill: 3), now: clock)
        XCTAssertEqual(server.log.filter { $0.hasPrefix("GET /api/day/") }, ["GET /api/day/2026-10-13", "GET /api/day/2026-10-11"])
        XCTAssertNotNil(host.state.days["2026-10-11"]?.fetchedAt)
    }
}

extension RowStatus {
    var isFailed: Bool {
        if case .failed = self { return true }
        return false
    }
}

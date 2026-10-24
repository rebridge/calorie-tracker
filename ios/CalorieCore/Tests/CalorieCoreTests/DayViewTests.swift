import Foundation
import XCTest
@testable import CalorieCore

final class DayViewTests: XCTestCase {
    private func stateWithServerDay() -> StoreState {
        var state = StoreState()
        state.goals = Goals(calorieGoal: 1800, proteinGoalG: 150, carbsGoalG: 200, fatGoalG: 65)
        state.days["2026-10-13"] = cachedDay(
            entries: [
                serverEntry(1, meal: .lunch, items: [serverItem(10, entry: 1, "Rice", 200), serverItem(11, entry: 1, "Beans", 150)]),
                serverEntry(2, meal: .dinner, createdAt: "2026-10-13T22:00:00.000Z", items: [serverItem(20, entry: 2, "Pasta", 600)]),
            ],
            burns: [ServerBurn(id: 5, localDate: "2026-10-13", calories: 300, note: "run", createdAt: "2026-10-13T11:00:00.000Z")],
            weight: 180
        )
        return state
    }

    func testServerDayAsIs() {
        let day = stateWithServerDay().day("2026-10-13")
        XCTAssertEqual(day.meals.map(\.mealType), [.breakfast, .lunch, .dinner, .snack])
        XCTAssertEqual(day.meals[1].calories, 350)
        XCTAssertEqual(day.totals.eatenKcal, 950)
        XCTAssertEqual(day.totals.burnedKcal, 300)
        XCTAssertEqual(day.remainingKcal, 1800 - 950 + 300)
        XCTAssertEqual(day.weight, WeightRow(weightLb: 180, status: .synced))
        XCTAssertEqual(day.meals[1].entries[0].status, .synced)
        XCTAssertNotNil(day.fetchedAt)
    }

    func testPendingChangesAreShownOnTop() {
        var state = stateWithServerDay()
        state.addEntry(localEntry([localItem("Eggs", 140)], meal: .lunch))
        state.updateItem(.server(10), ItemPatch(calories: 250))
        state.deleteEntry(.server(2))
        state.deleteBurn(.server(5))
        state.setWeight(date: "2026-10-13", weightLb: 179)

        let day = state.day("2026-10-13")
        let lunch = day.meals[1].entries
        // Newest first: the server entry was logged at 16:00Z, the phone's at 12:14Z.
        XCTAssertEqual(lunch.map(\.rawText), ["server entry", "eggs"])
        XCTAssertEqual(lunch[0].items[0].calories, 250)
        XCTAssertTrue(lunch[0].items[0].edited)
        XCTAssertEqual(lunch[0].status, .pending)
        XCTAssertEqual(lunch[1].status, .pending)
        guard case .local = lunch[1].id else { return XCTFail("the phone's entry has no server id yet") }
        XCTAssertTrue(day.meals[2].entries.isEmpty, "the deleted dinner is hidden")
        XCTAssertTrue(day.burns.isEmpty)
        XCTAssertEqual(day.weight, WeightRow(weightLb: 179, status: .pending))
        XCTAssertEqual(day.totals.eatenKcal, 250 + 150 + 140)
    }

    func testFailedChangesAreMarked() {
        var state = stateWithServerDay()
        state.updateItem(.server(20), ItemPatch(calories: 700))
        state.rejected(state.outbox[0], reason: "calories: Too small")
        XCTAssertEqual(state.day("2026-10-13").meals[2].entries[0].status, .failed("calories: Too small"))
    }

    func testQueuedTextWaitsForItsEstimate() {
        var state = StoreState()
        state.queueText(QueuedText(date: "2026-10-12", loggedAt: morning, text: "burrito", mealType: .lunch))
        let day = state.day("2026-10-12")
        let row = day.meals[1].entries[0]
        XCTAssertEqual(row.rawText, "burrito")
        XCTAssertEqual(row.status, .awaitingEstimate)
        XCTAssertEqual(row.calories, 0)
        XCTAssertNil(day.fetchedAt, "this day was never loaded from the server")
        XCTAssertEqual(day.goals, .defaults)
    }

    func testAnUploadEditedMidFlightShowsOnlyThePhonesCopy() throws {
        var state = StoreState()
        let eggs = localItem("Eggs", 140)
        state.addEntry(localEntry([eggs]))
        let sent = state.outbox[0]
        state.updateItem(.local(eggs.id), ItemPatch(calories: 200))
        try state.completed(sent, data: JSONSerialization.data(withJSONObject: entryJSON(41, itemIds: [410])))

        let day = state.day("2026-10-13")
        XCTAssertEqual(day.meals[0].entries.count, 1)
        XCTAssertEqual(day.meals[0].entries[0].items[0].calories, 200)
    }

    func testCalorieTrendRecomputesChangedDays() {
        var state = stateWithServerDay()
        state.calorieTrends["30d"] = CaloriesResponse(
            range: "30d", from: "2026-09-13", today: "2026-10-13", goalKcal: 1800,
            points: [.init(date: "2026-10-12", eatenKcal: 2000, burnedKcal: 0), .init(date: "2026-10-13", eatenKcal: 950, burnedKcal: 300)]
        )
        state.addEntry(localEntry([localItem("Eggs", 140)]))
        state.addBurn(LocalBurn(date: "2026-10-11", loggedAt: morning, calories: 200, note: nil))
        let points = state.calorieTrend(.month)!.points
        XCTAssertEqual(points, [
            .init(date: "2026-10-11", eatenKcal: 0, burnedKcal: 200),
            .init(date: "2026-10-12", eatenKcal: 2000, burnedKcal: 0),
            .init(date: "2026-10-13", eatenKcal: 1090, burnedKcal: 300),
        ])
    }
}

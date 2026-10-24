import Foundation
import XCTest
@testable import CalorieCore

final class StoreStateTests: XCTestCase {
    func testEditingAnEntryStillOnThePhoneChangesItsUpload() {
        var state = StoreState()
        let eggs = localItem("Eggs", 140)
        let entry = localEntry([eggs, localItem("Toast", 80)])
        state.addEntry(entry)

        state.updateItem(.local(eggs.id), ItemPatch(calories: 200))
        state.setMealType(.local(entry.clientId), .snack)

        XCTAssertEqual(state.outbox.count, 1)
        XCTAssertEqual(state.outbox[0].version, 2)
        guard case let .createEntry(queued) = state.outbox[0].op else { return XCTFail() }
        XCTAssertEqual(queued.mealType, .snack)
        XCTAssertEqual(queued.items[0].calories, 200)
        XCTAssertTrue(queued.items[0].edited)
        XCTAssertFalse(queued.items[1].edited)
    }

    func testDeletingTheLastLocalItemDropsTheEntry() {
        var state = StoreState()
        let eggs = localItem("Eggs", 140)
        let toast = localItem("Toast", 80)
        state.addEntry(localEntry([eggs, toast]))
        state.deleteItem(.local(eggs.id))
        XCTAssertEqual(state.outbox.count, 1)
        state.deleteItem(.local(toast.id))
        XCTAssertTrue(state.outbox.isEmpty)
    }

    func testEditsToAServerItemMergeIntoOnePatch() {
        var state = StoreState()
        state.updateItem(.server(5), ItemPatch(name: "Eggs", calories: 150))
        state.updateItem(.server(5), ItemPatch(calories: 160, fatG: 9))
        XCTAssertEqual(state.outbox.map(\.op), [.patchItem(id: 5, patch: ItemPatch(name: "Eggs", calories: 160, fatG: 9))])

        state.deleteItem(.server(5))
        XCTAssertEqual(state.outbox.map(\.op), [.deleteItem(id: 5)])
        state.updateItem(.server(5), ItemPatch(calories: 1))
        XCTAssertEqual(state.outbox.map(\.op), [.deleteItem(id: 5)], "an edit after a delete is ignored")
    }

    func testDeletingAServerEntryDropsItsQueuedEdits() {
        var state = StoreState()
        state.days["2026-10-13"] = cachedDay(entries: [serverEntry(1, items: [serverItem(10, entry: 1, "Rice", 200)])])
        state.updateItem(.server(10), ItemPatch(calories: 250))
        state.setMealType(.server(1), .dinner)
        state.updateItem(.server(99), ItemPatch(calories: 1))
        state.deleteEntry(.server(1))
        XCTAssertEqual(state.outbox.map(\.op), [.patchItem(id: 99, patch: ItemPatch(calories: 1)), .deleteEntry(id: 1)])
    }

    func testTheNewestWeightForADayWins() {
        var state = StoreState()
        state.setWeight(date: "2026-10-13", weightLb: 180)
        state.setWeight(date: "2026-10-12", weightLb: 181)
        state.setWeight(date: "2026-10-13", weightLb: 179.5)
        XCTAssertEqual(state.outbox.map(\.op), [
            .putWeight(date: "2026-10-12", weightLb: 181),
            .putWeight(date: "2026-10-13", weightLb: 179.5),
        ])
        state.deleteWeight(date: "2026-10-13")
        XCTAssertEqual(state.outbox.last?.op, .deleteWeight(date: "2026-10-13"))
        XCTAssertEqual(state.outbox.count, 2)
    }

    func testGoals() {
        var state = StoreState()
        XCTAssertEqual(state.currentGoals, .defaults)
        state.goals = Goals(calorieGoal: 1900, proteinGoalG: 140, carbsGoalG: 180, fatGoalG: 60)
        let mine = Goals(calorieGoal: 2100, proteinGoalG: 160, carbsGoalG: 210, fatGoalG: 70)
        state.setGoals(Goals(calorieGoal: 1, proteinGoalG: 1, carbsGoalG: 1, fatGoalG: 1))
        state.setGoals(mine)
        XCTAssertEqual(state.outbox.count, 1)
        XCTAssertEqual(state.currentGoals, mine)
    }

    func testLocalBurnEdits() {
        var state = StoreState()
        let burn = LocalBurn(date: "2026-10-13", loggedAt: morning, calories: 300, note: "run")
        state.addBurn(burn)
        state.updateBurn(.local(burn.clientId), BurnPatch(calories: 350, note: ""))
        guard case let .createBurn(queued) = state.outbox[0].op else { return XCTFail() }
        XCTAssertEqual(queued.calories, 350)
        XCTAssertNil(queued.note, "an empty note clears it")
        state.deleteBurn(.local(burn.clientId))
        XCTAssertTrue(state.outbox.isEmpty)
    }

    func testAnUploadedRecordIsEditedByItsServerIdThroughTheMap() throws {
        var state = StoreState()
        let eggs = localItem("Eggs", 140)
        let entry = localEntry([eggs])
        state.addEntry(entry)
        let sent = state.outbox[0]
        try state.completed(sent, data: JSONSerialization.data(withJSONObject: entryJSON(41, itemIds: [410])))

        XCTAssertTrue(state.outbox.isEmpty)
        XCTAssertEqual(state.idMap.entries[entry.clientId], 41)
        XCTAssertEqual(state.idMap.items[eggs.id], 410)
        // A sheet opened before the upload still holds the phone's ids.
        state.updateItem(.local(eggs.id), ItemPatch(calories: 150))
        state.setMealType(.local(entry.clientId), .lunch)
        XCTAssertEqual(state.outbox.map(\.op), [
            .patchItem(id: 410, patch: ItemPatch(calories: 150)),
            .patchEntry(id: 41, mealType: .lunch),
        ])
    }

    func testRejectedAndRetried() {
        var state = StoreState()
        state.setWeight(date: "2026-10-13", weightLb: 180)
        let sent = state.outbox[0]
        state.rejected(sent, reason: "nope")
        XCTAssertEqual(state.failedRecords.map(\.failure), ["nope"])
        XCTAssertEqual(state.pendingCount, 0)
        state.retry(sent.id)
        XCTAssertEqual(state.pendingCount, 1)
        state.discard(sent.id)
        XCTAssertTrue(state.outbox.isEmpty)
    }

    func testStoreFileRoundTrips() throws {
        var state = StoreState()
        state.days["2026-10-13"] = cachedDay(entries: [serverEntry(1, items: [serverItem(10, entry: 1, "Rice", 200)])], weight: 180)
        state.addEntry(localEntry([localItem("Eggs", 140)]))
        state.queueText(QueuedText(date: "2026-10-13", loggedAt: morning, text: "toast", mealType: .breakfast))
        state.setWeight(date: "2026-10-13", weightLb: 179)
        let data = try JSONCoding.storeEncoder.encode(state)
        XCTAssertEqual(try JSONCoding.storeDecoder.decode(StoreState.self, from: data), state)
    }
}

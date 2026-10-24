import Foundation

/// A record on screen: one the server has (by its id), or one that only exists on the phone so far (by its UUID).
public enum RecordRef: Hashable, Codable, Sendable {
    case server(Int)
    case local(UUID)
}

/// An item of an entry the phone estimated and hasn't uploaded yet.
public struct LocalItem: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var portion: String
    public var calories: Int
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
    public var confidence: Confidence
    public var assumption: String?
    public var edited: Bool

    public init(
        id: UUID = UUID(), name: String, portion: String, calories: Int, proteinG: Double, carbsG: Double,
        fatG: Double, confidence: Confidence, assumption: String?, edited: Bool = false
    ) {
        self.id = id
        self.name = name
        self.portion = portion
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.confidence = confidence
        self.assumption = assumption
        self.edited = edited
    }

    mutating func apply(_ patch: ItemPatch) {
        if let v = patch.name { name = v }
        if let v = patch.portion { portion = v }
        if let v = patch.calories { calories = v }
        if let v = patch.proteinG { proteinG = v }
        if let v = patch.carbsG { carbsG = v }
        if let v = patch.fatG { fatG = v }
        edited = true
    }
}

/// An entry the phone estimated by calling Claude itself. Uploaded with `PUT /api/sync/entries/:client_id`.
public struct LocalEntry: Codable, Equatable, Sendable {
    public var clientId: UUID
    public var date: String
    public var loggedAt: Date
    public var mealType: MealType
    public var text: String
    public var model: String
    /// Claude's raw reply, kept as the audit trail like the server does.
    public var modelResponse: String
    public var inputTokens: Int
    public var outputTokens: Int
    public var items: [LocalItem]

    public init(
        clientId: UUID = UUID(), date: String, loggedAt: Date, mealType: MealType, text: String, model: String,
        modelResponse: String, inputTokens: Int, outputTokens: Int, items: [LocalItem]
    ) {
        self.clientId = clientId
        self.date = date
        self.loggedAt = loggedAt
        self.mealType = mealType
        self.text = text
        self.model = model
        self.modelResponse = modelResponse
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.items = items
    }
}

/// Text saved without an estimate (no API key on the phone, or Claude unreachable). The server estimates it when
/// it's uploaded with `POST /api/entries`.
public struct QueuedText: Codable, Equatable, Sendable {
    public var clientId: UUID
    public var date: String
    public var loggedAt: Date
    public var text: String
    /// The meal chip picked on a past day, if any.
    public var mealType: MealType?

    public init(clientId: UUID = UUID(), date: String, loggedAt: Date, text: String, mealType: MealType?) {
        self.clientId = clientId
        self.date = date
        self.loggedAt = loggedAt
        self.text = text
        self.mealType = mealType
    }
}

/// A burn logged on the phone. Uploaded with `PUT /api/sync/burns/:client_id`.
public struct LocalBurn: Codable, Equatable, Sendable {
    public var clientId: UUID
    public var date: String
    public var loggedAt: Date
    public var calories: Int
    public var note: String?

    public init(clientId: UUID = UUID(), date: String, loggedAt: Date, calories: Int, note: String?) {
        self.clientId = clientId
        self.date = date
        self.loggedAt = loggedAt
        self.calories = calories
        self.note = note
    }
}

/// A partial item edit, the body of `PATCH /api/items/:id`. Nil fields are left as they are.
public struct ItemPatch: Codable, Equatable, Sendable {
    public var name: String?
    public var portion: String?
    public var calories: Int?
    public var proteinG: Double?
    public var carbsG: Double?
    public var fatG: Double?

    public init(
        name: String? = nil, portion: String? = nil, calories: Int? = nil, proteinG: Double? = nil,
        carbsG: Double? = nil, fatG: Double? = nil
    ) {
        self.name = name
        self.portion = portion
        self.calories = calories
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
    }

    /// `newer`'s fields win over this patch's.
    func merged(with newer: ItemPatch) -> ItemPatch {
        ItemPatch(
            name: newer.name ?? name, portion: newer.portion ?? portion, calories: newer.calories ?? calories,
            proteinG: newer.proteinG ?? proteinG, carbsG: newer.carbsG ?? carbsG, fatG: newer.fatG ?? fatG
        )
    }
}

/// A partial burn edit, the body of `PATCH /api/burns/:id`. An empty note clears it.
public struct BurnPatch: Codable, Equatable, Sendable {
    public var calories: Int?
    public var note: String?

    public init(calories: Int? = nil, note: String? = nil) {
        self.calories = calories
        self.note = note
    }

    func merged(with newer: BurnPatch) -> BurnPatch {
        BurnPatch(calories: newer.calories ?? calories, note: newer.note ?? note)
    }
}

/// A change waiting to reach the server. Creates carry the whole record; everything else names a server id,
/// because an edit to a record that's still only on the phone changes its create instead.
public enum PendingOp: Codable, Equatable, Sendable {
    case createEntry(LocalEntry)
    case queueText(QueuedText)
    case createBurn(LocalBurn)
    case putWeight(date: String, weightLb: Double)
    case deleteWeight(date: String)
    case patchItem(id: Int, patch: ItemPatch)
    case deleteItem(id: Int)
    case patchEntry(id: Int, mealType: MealType)
    case deleteEntry(id: Int)
    case patchBurn(id: Int, patch: BurnPatch)
    case deleteBurn(id: Int)
    case putGoals(Goals)
}

/// One queued change. `version` goes up whenever the change is edited, so an upload that was already on its way
/// can tell it sent an older copy.
public struct OutboxRecord: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public internal(set) var op: PendingOp
    public internal(set) var version: Int
    public let createdAt: Date
    /// Server errors (5xx) in a row. After a few, the change is marked failed.
    public internal(set) var attempts: Int
    /// Why the server refused it. A failed change is skipped until it's retried or discarded.
    public internal(set) var failure: String?

    init(op: PendingOp, createdAt: Date) {
        id = UUID()
        self.op = op
        version = 0
        self.createdAt = createdAt
        attempts = 0
        failure = nil
    }

    /// A one-line description for the Sync screen.
    public var summary: String {
        switch op {
        case let .createEntry(e): return "New entry: \(e.text)"
        case let .queueText(q): return "New entry (server estimates): \(q.text)"
        case let .createBurn(b): return "Burned \(b.calories) kcal on \(b.date)"
        case let .putWeight(date, lb): return "Weight \(lb) lb on \(date)"
        case let .deleteWeight(date): return "Delete weight on \(date)"
        case .patchItem: return "Edit an item"
        case .deleteItem: return "Delete an item"
        case let .patchEntry(_, meal): return "Move an entry to \(meal.label)"
        case .deleteEntry: return "Delete an entry"
        case .patchBurn: return "Edit a burn"
        case .deleteBurn: return "Delete a burn"
        case .putGoals: return "Update goals"
        }
    }
}

/// Server ids for records the phone created, once uploaded. A screen still holding the phone's UUID for one
/// (a sheet left open across a sync) edits the server's copy through this.
public struct IDMap: Codable, Equatable, Sendable {
    public var entries: [UUID: Int] = [:]
    public var items: [UUID: Int] = [:]
    public var burns: [UUID: Int] = [:]
}

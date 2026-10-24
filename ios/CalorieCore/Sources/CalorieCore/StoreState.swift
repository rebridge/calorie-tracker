import Foundation

/// One day as the server last returned it, plus uploads that have finished since.
public struct CachedDay: Codable, Equatable, Sendable {
    public var date: String
    public var entries: [ServerEntry] = []
    public var burns: [ServerBurn] = []
    public var weight: ServerWeight?
    /// When it was last fetched; nil for a day the phone only knows from its own uploads.
    public var fetchedAt: Date?

    public init(date: String) {
        self.date = date
    }

    /// Applies a change aimed at a server record (or this day's weight). Returns whether it touched this day.
    /// Used to show pending changes on top of the cache, and to fold a finished upload into it.
    @discardableResult
    mutating func apply(_ op: PendingOp) -> Bool {
        switch op {
        case let .patchItem(id, patch):
            for e in entries.indices {
                guard let i = entries[e].items.firstIndex(where: { $0.id == id }) else { continue }
                var item = entries[e].items[i]
                if let v = patch.name { item.name = v }
                if let v = patch.portion { item.portion = v }
                if let v = patch.calories { item.calories = v }
                if let v = patch.proteinG { item.proteinG = v }
                if let v = patch.carbsG { item.carbsG = v }
                if let v = patch.fatG { item.fatG = v }
                item.edited = true
                entries[e].items[i] = item
                return true
            }
            return false
        case let .deleteItem(id):
            guard let e = entries.firstIndex(where: { $0.items.contains { $0.id == id } }) else { return false }
            entries[e].items.removeAll { $0.id == id }
            // The server deletes an entry with its last item.
            if entries[e].items.isEmpty { entries.remove(at: e) }
            return true
        case let .patchEntry(id, mealType):
            guard let e = entries.firstIndex(where: { $0.id == id }) else { return false }
            entries[e].mealType = mealType
            return true
        case let .deleteEntry(id):
            let before = entries.count
            entries.removeAll { $0.id == id }
            return entries.count != before
        case let .patchBurn(id, patch):
            guard let b = burns.firstIndex(where: { $0.id == id }) else { return false }
            if let v = patch.calories { burns[b].calories = v }
            if let v = patch.note { burns[b].note = v.trimmingCharacters(in: .whitespaces).isEmpty ? nil : v }
            return true
        case let .deleteBurn(id):
            let before = burns.count
            burns.removeAll { $0.id == id }
            return burns.count != before
        case let .putWeight(date, lb):
            guard date == self.date else { return false }
            weight = ServerWeight(weightLb: lb, createdAt: weight?.createdAt ?? "")
            return true
        case let .deleteWeight(date):
            guard date == self.date else { return false }
            weight = nil
            return true
        case .createEntry, .queueText, .createBurn, .putGoals:
            return false
        }
    }
}

/// Everything the phone keeps: the server's data as of the last sync, and the changes made since.
/// Saved to disk as JSON after every change.
public struct StoreState: Codable, Equatable, Sendable {
    public var days: [String: CachedDay] = [:]
    /// The goals as of the last sync; pending goal changes are applied on top by `currentGoals`.
    public var goals: Goals?
    public var settings: SettingsResponse?
    public var weightTrends: [String: WeightsResponse] = [:]
    public var calorieTrends: [String: CaloriesResponse] = [:]
    public internal(set) var outbox: [OutboxRecord] = []
    public internal(set) var idMap = IDMap()
    public var lastSyncAt: Date?

    public init() {}

    public var pendingCount: Int { outbox.filter { $0.failure == nil }.count }
    public var failedRecords: [OutboxRecord] { outbox.filter { $0.failure != nil } }

    public var currentGoals: Goals {
        for record in outbox.reversed() {
            if case let .putGoals(g) = record.op { return g }
        }
        return goals ?? .defaults
    }
}

// MARK: - Changes made on the phone

extension StoreState {
    mutating func enqueue(_ op: PendingOp, now: Date = Date()) {
        outbox.append(OutboxRecord(op: op, createdAt: now))
    }

    /// Edits a queued change in place. Bumping the version tells an upload already in flight that it sent an older copy.
    private mutating func modify(at index: Int, _ body: (inout PendingOp) -> Void) {
        body(&outbox[index].op)
        outbox[index].version += 1
        outbox[index].failure = nil
        outbox[index].attempts = 0
    }

    private mutating func removeOps(where matches: (PendingOp) -> Bool) {
        outbox.removeAll { matches($0.op) }
    }

    private func hasOp(where matches: (PendingOp) -> Bool) -> Bool {
        outbox.contains { matches($0.op) }
    }

    /// The queued create for an entry that's still only on the phone.
    private func entryCreateIndex(_ clientId: UUID) -> Int? {
        outbox.firstIndex {
            switch $0.op {
            case let .createEntry(e): return e.clientId == clientId
            case let .queueText(q): return q.clientId == clientId
            default: return false
            }
        }
    }

    private func itemCreateIndex(_ itemId: UUID) -> Int? {
        outbox.firstIndex {
            if case let .createEntry(e) = $0.op { return e.items.contains { $0.id == itemId } }
            return false
        }
    }

    private func burnCreateIndex(_ clientId: UUID) -> Int? {
        outbox.firstIndex {
            if case let .createBurn(b) = $0.op { return b.clientId == clientId }
            return false
        }
    }

    public mutating func addEntry(_ entry: LocalEntry) {
        enqueue(.createEntry(entry))
    }

    public mutating func queueText(_ text: QueuedText) {
        enqueue(.queueText(text))
    }

    public mutating func addBurn(_ burn: LocalBurn) {
        enqueue(.createBurn(burn))
    }

    /// The newest weight for a day replaces any earlier one still waiting.
    public mutating func setWeight(date: String, weightLb: Double) {
        removeOps {
            switch $0 {
            case let .putWeight(d, _), let .deleteWeight(d): return d == date
            default: return false
            }
        }
        enqueue(.putWeight(date: date, weightLb: weightLb))
    }

    /// Always sent, even if the weight never reached the server: an upload of it may be in flight,
    /// and deleting a weight the server doesn't have is harmless.
    public mutating func deleteWeight(date: String) {
        removeOps {
            switch $0 {
            case let .putWeight(d, _), let .deleteWeight(d): return d == date
            default: return false
            }
        }
        enqueue(.deleteWeight(date: date))
    }

    public mutating func updateItem(_ ref: RecordRef, _ patch: ItemPatch) {
        switch ref {
        case let .local(uuid):
            if let i = itemCreateIndex(uuid) {
                modify(at: i) { op in
                    guard case var .createEntry(e) = op, let k = e.items.firstIndex(where: { $0.id == uuid }) else { return }
                    e.items[k].apply(patch)
                    op = .createEntry(e)
                }
            } else if let id = idMap.items[uuid] {
                updateItem(.server(id), patch)
            }
        case let .server(id):
            if hasOp(where: { $0 == .deleteItem(id: id) }) { return }
            if let i = outbox.firstIndex(where: { if case .patchItem(id, _) = $0.op { return true }; return false }) {
                modify(at: i) { op in
                    if case let .patchItem(_, earlier) = op { op = .patchItem(id: id, patch: earlier.merged(with: patch)) }
                }
            } else {
                enqueue(.patchItem(id: id, patch: patch))
            }
        }
    }

    public mutating func deleteItem(_ ref: RecordRef) {
        switch ref {
        case let .local(uuid):
            if let i = itemCreateIndex(uuid), case var .createEntry(e) = outbox[i].op {
                e.items.removeAll { $0.id == uuid }
                if e.items.isEmpty {
                    outbox.remove(at: i)
                } else {
                    modify(at: i) { $0 = .createEntry(e) }
                }
            } else if let id = idMap.items[uuid] {
                deleteItem(.server(id))
            }
        case let .server(id):
            removeOps { if case .patchItem(id, _) = $0 { return true }; return false }
            if !hasOp(where: { $0 == .deleteItem(id: id) }) { enqueue(.deleteItem(id: id)) }
        }
    }

    public mutating func setMealType(_ ref: RecordRef, _ mealType: MealType) {
        switch ref {
        case let .local(uuid):
            if let i = entryCreateIndex(uuid) {
                modify(at: i) { op in
                    switch op {
                    case var .createEntry(e):
                        e.mealType = mealType
                        op = .createEntry(e)
                    case var .queueText(q):
                        q.mealType = mealType
                        op = .queueText(q)
                    default: break
                    }
                }
            } else if let id = idMap.entries[uuid] {
                setMealType(.server(id), mealType)
            }
        case let .server(id):
            removeOps { if case .patchEntry(id, _) = $0 { return true }; return false }
            enqueue(.patchEntry(id: id, mealType: mealType))
        }
    }

    public mutating func deleteEntry(_ ref: RecordRef) {
        switch ref {
        case let .local(uuid):
            if let i = entryCreateIndex(uuid) {
                outbox.remove(at: i)
            } else if let id = idMap.entries[uuid] {
                deleteEntry(.server(id))
            }
        case let .server(id):
            let itemIds = Set(days.values.flatMap(\.entries).first { $0.id == id }?.items.map(\.id) ?? [])
            removeOps {
                switch $0 {
                case .patchEntry(id, _): return true
                case let .patchItem(item, _), let .deleteItem(item): return itemIds.contains(item)
                default: return false
                }
            }
            if !hasOp(where: { $0 == .deleteEntry(id: id) }) { enqueue(.deleteEntry(id: id)) }
        }
    }

    public mutating func updateBurn(_ ref: RecordRef, _ patch: BurnPatch) {
        switch ref {
        case let .local(uuid):
            if let i = burnCreateIndex(uuid) {
                modify(at: i) { op in
                    guard case var .createBurn(b) = op else { return }
                    if let v = patch.calories { b.calories = v }
                    if let v = patch.note { b.note = v.isEmpty ? nil : v }
                    op = .createBurn(b)
                }
            } else if let id = idMap.burns[uuid] {
                updateBurn(.server(id), patch)
            }
        case let .server(id):
            if hasOp(where: { $0 == .deleteBurn(id: id) }) { return }
            if let i = outbox.firstIndex(where: { if case .patchBurn(id, _) = $0.op { return true }; return false }) {
                modify(at: i) { op in
                    if case let .patchBurn(_, earlier) = op { op = .patchBurn(id: id, patch: earlier.merged(with: patch)) }
                }
            } else {
                enqueue(.patchBurn(id: id, patch: patch))
            }
        }
    }

    public mutating func deleteBurn(_ ref: RecordRef) {
        switch ref {
        case let .local(uuid):
            if let i = burnCreateIndex(uuid) {
                outbox.remove(at: i)
            } else if let id = idMap.burns[uuid] {
                deleteBurn(.server(id))
            }
        case let .server(id):
            removeOps { if case .patchBurn(id, _) = $0 { return true }; return false }
            if !hasOp(where: { $0 == .deleteBurn(id: id) }) { enqueue(.deleteBurn(id: id)) }
        }
    }

    public mutating func setGoals(_ goals: Goals) {
        removeOps { if case .putGoals = $0 { return true }; return false }
        enqueue(.putGoals(goals))
    }

    /// Clears a failure so the next sync tries the change again.
    public mutating func retry(_ id: UUID) {
        guard let i = outbox.firstIndex(where: { $0.id == id }) else { return }
        outbox[i].failure = nil
        outbox[i].attempts = 0
    }

    /// Drops a change for good. For a new entry or burn, that deletes it from the phone.
    public mutating func discard(_ id: UUID) {
        outbox.removeAll { $0.id == id }
    }
}

// MARK: - Results of uploads (called by `SyncEngine`)

extension StoreState {
    /// The day a change belongs to, so the sync can refresh it.
    func date(of op: PendingOp) -> String? {
        let allEntries = days.values.flatMap(\.entries)
        switch op {
        case let .createEntry(e): return e.date
        case let .queueText(q): return q.date
        case let .createBurn(b): return b.date
        case let .putWeight(date, _), let .deleteWeight(date): return date
        case .putGoals: return nil
        case let .patchItem(id, _), let .deleteItem(id):
            return allEntries.first { $0.items.contains { $0.id == id } }?.localDate
        case let .patchEntry(id, _), let .deleteEntry(id):
            return allEntries.first { $0.id == id }?.localDate
        case let .patchBurn(id, _), let .deleteBurn(id):
            return days.values.flatMap(\.burns).first { $0.id == id }?.localDate
        }
    }

    private func current(_ sent: OutboxRecord) -> OutboxRecord? {
        outbox.first { $0.id == sent.id }
    }

    private mutating func remove(_ sent: OutboxRecord) {
        outbox.removeAll { $0.id == sent.id }
    }

    private mutating func cache(_ entry: ServerEntry) {
        var day = days[entry.localDate] ?? CachedDay(date: entry.localDate)
        day.entries.removeAll { $0.id == entry.id }
        day.entries.append(entry)
        days[entry.localDate] = day
    }

    private mutating func cache(_ burn: ServerBurn) {
        var day = days[burn.localDate] ?? CachedDay(date: burn.localDate)
        day.burns.removeAll { $0.id == burn.id }
        day.burns.append(burn)
        days[burn.localDate] = day
    }

    /// Folds a change the server accepted into the cache, so it shows without waiting for a refresh.
    private mutating func commit(_ op: PendingOp) {
        if case let .putGoals(g) = op {
            goals = g
            return
        }
        if case let .putWeight(date, _) = op, days[date] == nil { days[date] = CachedDay(date: date) }
        for key in Array(days.keys) {
            days[key]!.apply(op)
        }
    }

    /// The server accepted `sent`; `data` is its reply.
    mutating func completed(_ sent: OutboxRecord, data: Data) throws {
        let now = current(sent)
        let unchanged = now?.version == sent.version
        switch sent.op {
        case let .createEntry(local):
            let entry = try JSONCoding.apiDecoder.decode(ServerEntry.self, from: data)
            idMap.entries[local.clientId] = entry.id
            // The server saves items in the order sent.
            for (item, saved) in zip(local.items, entry.items) { idMap.items[item.id] = saved.id }
            cache(entry)
            if now == nil {
                // Deleted on the phone while it was uploading.
                enqueue(.deleteEntry(id: entry.id))
            } else if unchanged {
                remove(sent)
            }
            // Edited while uploading: left queued, and the next upload replaces the server's copy.
        case let .queueText(text):
            let entry = try JSONCoding.apiDecoder.decode(ServerEntry.self, from: data)
            idMap.entries[text.clientId] = entry.id
            cache(entry)
            if let now {
                // The only edit a queued text takes is its meal type, which can now go as a normal edit.
                if !unchanged, case let .queueText(latest) = now.op, let meal = latest.mealType, meal != entry.mealType {
                    enqueue(.patchEntry(id: entry.id, mealType: meal))
                }
                remove(sent)
            } else {
                enqueue(.deleteEntry(id: entry.id))
            }
        case let .createBurn(local):
            let burn = try JSONCoding.apiDecoder.decode(ServerBurn.self, from: data)
            idMap.burns[local.clientId] = burn.id
            cache(burn)
            if now == nil {
                enqueue(.deleteBurn(id: burn.id))
            } else if unchanged {
                remove(sent)
            }
        default:
            commit(sent.op)
            if unchanged { remove(sent) }
        }
    }

    /// The record an edit or delete was aimed at is gone from the server (404), so the change is moot.
    mutating func gone(_ sent: OutboxRecord) {
        switch sent.op {
        case let .patchItem(id, _): commit(.deleteItem(id: id))
        case let .patchEntry(id, _): commit(.deleteEntry(id: id))
        case let .patchBurn(id, _): commit(.deleteBurn(id: id))
        default: commit(sent.op)
        }
        remove(sent)
    }

    /// The server refused `sent` (4xx). It stays queued, marked failed, until it's retried or discarded,
    /// unless it was edited meanwhile, in which case the new copy gets its own try.
    mutating func rejected(_ sent: OutboxRecord, reason: String) {
        guard let i = outbox.firstIndex(where: { $0.id == sent.id }), outbox[i].version == sent.version else { return }
        outbox[i].failure = reason
    }

    static let maxServerErrors = 5

    /// The server had an error (5xx). After `maxServerErrors` in a row it's marked failed so it can't block the queue.
    mutating func serverError(_ sent: OutboxRecord, reason: String) {
        guard let i = outbox.firstIndex(where: { $0.id == sent.id }) else { return }
        outbox[i].attempts += 1
        if outbox[i].attempts >= Self.maxServerErrors { outbox[i].failure = reason }
    }

    /// Replaces the cached day with the server's.
    mutating func store(_ day: DayResponse, fetchedAt: Date) {
        var cached = CachedDay(date: day.date)
        cached.entries = day.meals.flatMap(\.entries)
        cached.burns = day.burns
        cached.weight = day.weight
        cached.fetchedAt = fetchedAt
        days[day.date] = cached
        goals = day.goals
    }
}

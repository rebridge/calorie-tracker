import Foundation

/// Whether a row on screen is on the server yet.
public enum RowStatus: Equatable, Sendable {
    case synced
    /// Saved on the phone; goes up with the next sync.
    case pending
    /// Text saved without an estimate; the server estimates it when it's uploaded.
    case awaitingEstimate
    /// The server refused the change. Settings → Sync shows why and can retry or discard it.
    case failed(String)

    /// The more urgent of two statuses (failed > waiting > pending > synced).
    func combined(with other: RowStatus) -> RowStatus {
        func rank(_ s: RowStatus) -> Int {
            switch s {
            case .synced: return 0
            case .pending: return 1
            case .awaitingEstimate: return 2
            case .failed: return 3
            }
        }
        return rank(other) > rank(self) ? other : self
    }
}

public struct ItemRow: Identifiable, Equatable, Sendable {
    public var id: RecordRef
    public var name: String
    public var portion: String
    public var calories: Int
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
    public var confidence: Confidence
    public var assumption: String?
    public var edited: Bool
}

public struct EntryRow: Identifiable, Equatable, Sendable {
    public var id: RecordRef
    public var date: String
    public var createdAt: Date
    public var mealType: MealType
    public var rawText: String
    public var items: [ItemRow]
    public var status: RowStatus

    public var calories: Int { items.reduce(0) { $0 + $1.calories } }
    public var proteinG: Double { round1(items.reduce(0) { $0 + $1.proteinG }) }
    public var carbsG: Double { round1(items.reduce(0) { $0 + $1.carbsG }) }
    public var fatG: Double { round1(items.reduce(0) { $0 + $1.fatG }) }
}

public struct MealSection: Identifiable, Equatable, Sendable {
    public var mealType: MealType
    /// Newest first.
    public var entries: [EntryRow]

    public var id: MealType { mealType }
    public var calories: Int { entries.reduce(0) { $0 + $1.calories } }
}

public struct BurnRow: Identifiable, Equatable, Sendable {
    public var id: RecordRef
    public var calories: Int
    public var note: String?
    public var createdAt: Date
    public var status: RowStatus
}

public struct WeightRow: Equatable, Sendable {
    public var weightLb: Double
    public var status: RowStatus
}

public struct DayTotals: Equatable, Sendable {
    public var eatenKcal: Int
    public var burnedKcal: Int
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
}

/// One day as the screen shows it: the server's copy with the phone's pending changes applied.
public struct DayView: Equatable, Sendable {
    public var date: String
    /// All four meals, Breakfast → Lunch → Dinner → Snack.
    public var meals: [MealSection]
    /// Oldest first.
    public var burns: [BurnRow]
    public var weight: WeightRow?
    public var goals: Goals
    public var totals: DayTotals
    /// When the server's copy was fetched; nil if this day has never been loaded from the server.
    public var fetchedAt: Date?

    /// goal − eaten + burned: burned calories add to the budget.
    public var remainingKcal: Int { goals.calorieGoal - totals.eatenKcal + totals.burnedKcal }
    public var isEmpty: Bool { meals.allSatisfy(\.entries.isEmpty) && burns.isEmpty && weight == nil }
}

func round1(_ n: Double) -> Double { (n * 10).rounded() / 10 }

/// What a queued change is about, to mark its row.
private enum Target: Hashable {
    case entry(Int), item(Int), burn(Int), weight(String)
}

private extension PendingOp {
    var target: Target? {
        switch self {
        case let .patchItem(id, _), let .deleteItem(id): return .item(id)
        case let .patchEntry(id, _), let .deleteEntry(id): return .entry(id)
        case let .patchBurn(id, _), let .deleteBurn(id): return .burn(id)
        case let .putWeight(date, _), let .deleteWeight(date): return .weight(date)
        case .createEntry, .queueText, .createBurn, .putGoals: return nil
        }
    }
}

private extension OutboxRecord {
    var status: RowStatus { failure.map(RowStatus.failed) ?? .pending }
}

extension StoreState {
    /// The day as it should look right now, whether or not the server has caught up.
    public func day(_ date: String) -> DayView {
        var base = days[date] ?? CachedDay(date: date)
        var statuses: [Target: RowStatus] = [:]
        for record in outbox {
            guard base.apply(record.op), let target = record.op.target else { continue }
            statuses[target] = (statuses[target] ?? .synced).combined(with: record.status)
        }

        // An upload edited mid-flight is still queued but already on the server: show the phone's copy only.
        var hiddenEntries = Set<Int>()
        var hiddenBurns = Set<Int>()
        for record in outbox {
            switch record.op {
            case let .createEntry(e): if let id = idMap.entries[e.clientId] { hiddenEntries.insert(id) }
            case let .createBurn(b): if let id = idMap.burns[b.clientId] { hiddenBurns.insert(id) }
            default: break
            }
        }

        var entries: [EntryRow] = base.entries.filter { !hiddenEntries.contains($0.id) }.map { entry in
            let items = entry.items.map { item in
                ItemRow(
                    id: .server(item.id), name: item.name, portion: item.portion, calories: item.calories,
                    proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG, confidence: item.confidence,
                    assumption: item.assumption, edited: item.edited
                )
            }
            let status = entry.items.reduce(statuses[.entry(entry.id)] ?? .synced) {
                $0.combined(with: statuses[.item($1.id)] ?? .synced)
            }
            return EntryRow(
                id: .server(entry.id), date: entry.localDate, createdAt: ISOTime.parse(entry.createdAt) ?? .distantPast,
                mealType: entry.mealType, rawText: entry.rawText, items: items, status: status
            )
        }
        var burns: [BurnRow] = base.burns.filter { !hiddenBurns.contains($0.id) }.map { burn in
            BurnRow(
                id: .server(burn.id), calories: burn.calories, note: burn.note,
                createdAt: ISOTime.parse(burn.createdAt) ?? .distantPast, status: statuses[.burn(burn.id)] ?? .synced
            )
        }

        for record in outbox {
            switch record.op {
            case let .createEntry(e) where e.date == date:
                let items = e.items.map { item in
                    ItemRow(
                        id: .local(item.id), name: item.name, portion: item.portion, calories: item.calories,
                        proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG, confidence: item.confidence,
                        assumption: item.assumption, edited: item.edited
                    )
                }
                entries.append(EntryRow(
                    id: .local(e.clientId), date: date, createdAt: e.loggedAt, mealType: e.mealType, rawText: e.text,
                    items: items, status: record.status
                ))
            case let .queueText(q) where q.date == date:
                entries.append(EntryRow(
                    id: .local(q.clientId), date: date, createdAt: q.loggedAt, mealType: q.mealType ?? .snack,
                    rawText: q.text, items: [],
                    status: record.failure.map(RowStatus.failed) ?? .awaitingEstimate
                ))
            case let .createBurn(b) where b.date == date:
                burns.append(BurnRow(
                    id: .local(b.clientId), calories: b.calories, note: b.note, createdAt: b.loggedAt, status: record.status
                ))
            default:
                break
            }
        }

        entries.sort { $0.createdAt > $1.createdAt }
        burns.sort { $0.createdAt < $1.createdAt }
        let meals = MealType.allCases.map { meal in MealSection(mealType: meal, entries: entries.filter { $0.mealType == meal }) }
        let totals = DayTotals(
            eatenKcal: entries.reduce(0) { $0 + $1.calories },
            burnedKcal: burns.reduce(0) { $0 + $1.calories },
            proteinG: round1(entries.reduce(0) { $0 + $1.proteinG }),
            carbsG: round1(entries.reduce(0) { $0 + $1.carbsG }),
            fatG: round1(entries.reduce(0) { $0 + $1.fatG })
        )
        return DayView(
            date: date, meals: meals, burns: burns,
            weight: base.weight.map { WeightRow(weightLb: $0.weightLb, status: statuses[.weight(date)] ?? .synced) },
            goals: currentGoals, totals: totals, fetchedAt: base.fetchedAt
        )
    }

    /// Days with changes still waiting to go up.
    public var datesWithPendingChanges: Set<String> {
        Set(outbox.compactMap { date(of: $0.op) })
    }

    /// The calories chart as of the last sync, with days changed on the phone since then recomputed.
    public func calorieTrend(_ range: TrendRange) -> CaloriesResponse? {
        guard var trend = calorieTrends[range.rawValue] else { return nil }
        var points = Dictionary(uniqueKeysWithValues: trend.points.map { ($0.date, $0) })
        for date in datesWithPendingChanges where date >= trend.from && date <= trend.today {
            // Only recompute a day the phone has the server's copy of, or one the server has nothing for.
            guard days[date]?.fetchedAt != nil || points[date] == nil else { continue }
            let totals = day(date).totals
            points[date] = .init(date: date, eatenKcal: totals.eatenKcal, burnedKcal: totals.burnedKcal)
        }
        trend.points = points.values.filter { $0.eatenKcal > 0 || $0.burnedKcal > 0 }.sorted { $0.date < $1.date }
        trend.goalKcal = currentGoals.calorieGoal
        return trend
    }
}

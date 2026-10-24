import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Owns the phone's `StoreState` and saves it whenever the sync changes it.
@MainActor
public protocol SyncHost: AnyObject {
    var state: StoreState { get set }
    func stateDidChange()
}

/// What to fetch after the queue is flushed.
public struct RefreshPlan: Sendable {
    /// Days to reload: today and whatever is on screen.
    public var dates: [String]
    public var weightRange: TrendRange
    public var calorieRange: TrendRange
    /// Also load any of the last this-many days the phone has never fetched, for browsing history offline.
    public var backfillDays: Int

    public init(dates: [String], weightRange: TrendRange, calorieRange: TrendRange, backfillDays: Int = 14) {
        self.dates = dates
        self.weightRange = weightRange
        self.calorieRange = calorieRange
        self.backfillDays = backfillDays
    }
}

public struct SyncReport: Equatable, Sendable {
    /// False when the server couldn't be reached (off the tailnet, or it's down).
    public var reachable: Bool
    /// Changes the server accepted this run.
    public var uploaded: Int
    /// Changes the server refused this run.
    public var refused: Int
    /// Why the run stopped early, if it did.
    public var message: String?
}

/// Uploads queued changes to the home server whenever it's reachable, then refreshes what the phone shows.
@MainActor
public final class SyncEngine {
    public private(set) var isRunning = false
    private let transport: HTTPTransport

    public init(transport: HTTPTransport) {
        self.transport = transport
    }

    /// Whether the server answers its health check.
    public func isReachable(_ api: ServerAPI) async -> Bool {
        guard let (_, response) = try? await transport.send(api.health()) else { return false }
        return (200..<300).contains(response.statusCode)
    }

    /// One sync: check the server, upload queued changes in order, then reload `plan`'s days and charts.
    /// Returns nil if a sync is already running.
    public func sync(host: SyncHost, api: ServerAPI, plan: RefreshPlan, now: () -> Date = Date.init) async -> SyncReport? {
        guard !isRunning else { return nil }
        isRunning = true
        defer { isRunning = false }

        var report = SyncReport(reachable: false, uploaded: 0, refused: 0, message: nil)
        guard await isReachable(api) else { return report }
        report.reachable = true

        // Upload. An upload edited while in flight stays queued and goes again; the budget stops a runaway loop.
        var touched = Set<String>()
        var budget = host.state.outbox.count * 3 + 10
        while budget > 0, let record = host.state.outbox.first(where: { $0.failure == nil }) {
            budget -= 1
            if let date = host.state.date(of: record.op) { touched.insert(date) }
            let response: (Data, HTTPURLResponse)
            do {
                response = try await transport.send(try api.request(for: record.op))
            } catch is EncodingError {
                host.state.rejected(record, reason: "Couldn't encode this change")
                report.refused += 1
                host.stateDidChange()
                continue
            } catch {
                report.reachable = false
                report.message = "Lost the connection to the server"
                return report
            }
            switch ServerAPI.outcome(for: record.op, status: response.1.statusCode, data: response.0) {
            case .done:
                do {
                    try host.state.completed(record, data: response.0)
                    report.uploaded += 1
                } catch {
                    host.state.rejected(record, reason: "Unexpected reply from the server")
                    report.refused += 1
                }
            case .gone:
                host.state.gone(record)
                report.uploaded += 1
            case let .rejected(reason):
                host.state.rejected(record, reason: reason)
                report.refused += 1
            case let .serverError(reason):
                host.state.serverError(record, reason: reason)
                host.stateDidChange()
                report.message = "Server error: \(reason)"
                return report
            }
            host.stateDidChange()
        }

        // Refresh. The goals come with every day, and the settings carry the token totals.
        do {
            if let settings: SettingsResponse = try await fetch(api.settings()) {
                host.state.settings = settings
                host.state.goals = settings.goals
            }
            let today = LocalDate.today(now())
            let backfill = (0..<plan.backfillDays).map { LocalDate.addDays(today, -$0) }
                .filter { host.state.days[$0]?.fetchedAt == nil }
            var dates: [String] = []
            for date in plan.dates + touched.sorted() + backfill where !dates.contains(date) && date <= today {
                dates.append(date)
            }
            for date in dates {
                if let day: DayResponse = try await fetch(api.day(date)) { host.state.store(day, fetchedAt: now()) }
            }
            if let weights: WeightsResponse = try await fetch(api.weights(plan.weightRange)) {
                host.state.weightTrends[plan.weightRange.rawValue] = weights
            }
            if let calories: CaloriesResponse = try await fetch(api.calories(plan.calorieRange)) {
                host.state.calorieTrends[plan.calorieRange.rawValue] = calories
            }
            host.state.lastSyncAt = now()
        } catch {
            report.message = "Lost the connection to the server"
        }
        host.stateDidChange()
        return report
    }

    /// Nil for a non-2xx reply or one that doesn't decode; throws when the server can't be reached.
    private func fetch<T: Decodable>(_ request: URLRequest) async throws -> T? {
        let (data, response) = try await transport.send(request)
        guard (200..<300).contains(response.statusCode) else { return nil }
        return try? JSONCoding.apiDecoder.decode(T.self, from: data)
    }
}

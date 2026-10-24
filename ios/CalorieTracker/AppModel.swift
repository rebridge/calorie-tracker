import BackgroundTasks
import CalorieCore
import Foundation
import Network
import Observation

/// A short message shown over the screen.
struct Toast: Identifiable, Equatable {
    let id = UUID()
    var message: String
    var isError = false
}

/// How the last attempt to reach the home server went.
enum SyncPhase: Equatable {
    /// No server address yet: everything stays on the phone.
    case notConfigured
    case idle
    case syncing
    /// The server didn't answer (off the tailnet, or it's down). Changes wait on the phone.
    case offline
    case synced
    case error(String)
}

/// The app's state and actions. Changes are saved on the phone first and uploaded whenever the server answers.
@MainActor
@Observable
final class AppModel: SyncHost {
    static let shared = AppModel()

    var state: StoreState
    private(set) var serverURL: URL?
    private(set) var hasAPIKey: Bool
    private(set) var phase: SyncPhase
    var toast: Toast? = nil
    /// The Day tab's date, refreshed along with today.
    var viewedDate: String? = nil
    var weightRange: TrendRange = .month
    var calorieRange: TrendRange = .week

    private let transport = URLSessionTransport()
    private let engine: SyncEngine
    private let pathMonitor = NWPathMonitor()
    @ObservationIgnored private var pollTask: Task<Void, Never>? = nil
    @ObservationIgnored private var debounceTask: Task<Void, Never>? = nil
    @ObservationIgnored private var syncTask: Task<Void, Never>? = nil
    @ObservationIgnored private var syncAgain = false

    private enum Defaults {
        static let server = "serverAddress"
    }

    init() {
        state = StoreFile.load() ?? StoreState()
        serverURL = UserDefaults.standard.string(forKey: Defaults.server).flatMap(ServerAPI.baseURL(from:))
        hasAPIKey = Keychain.read(Keychain.apiKey) != nil
        phase = serverURL == nil ? .notConfigured : .idle
        engine = SyncEngine(transport: transport)
        // Turning Tailscale on or off, or joining Wi-Fi, changes the network path: a good moment to try.
        pathMonitor.pathUpdateHandler = { [weak self] _ in
            Task { @MainActor in self?.requestSync(after: 1.5) }
        }
        pathMonitor.start(queue: DispatchQueue(label: "CalorieTracker.path-monitor"))
    }

    // MARK: Sync

    func stateDidChange() {
        StoreFile.save(state)
    }

    /// After a change made on the phone: save it, then try to upload it.
    private func changed() {
        StoreFile.save(state)
        requestSync(after: 0.5)
    }

    /// Syncs after `delay`; calls made meanwhile push it back, so a burst of edits goes up together.
    func requestSync(after delay: TimeInterval = 0) {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            guard !Task.isCancelled else { return }
            self?.startSync()
        }
    }

    /// Syncs now and waits for it (pull to refresh).
    func syncNow() async {
        startSync()
        await syncTask?.value
    }

    private func startSync() {
        guard syncTask == nil else {
            // Something changed mid-sync: go again when it's done.
            syncAgain = true
            return
        }
        syncTask = Task { [weak self] in
            guard let self else { return }
            repeat {
                syncAgain = false
                await runSync()
            } while syncAgain
            syncTask = nil
        }
    }

    private func runSync() async {
        guard let serverURL else {
            phase = .notConfigured
            return
        }
        phase = .syncing
        let today = LocalDate.today()
        var dates = [today]
        if let viewedDate, viewedDate != today { dates.append(viewedDate) }
        let plan = RefreshPlan(dates: dates, weightRange: weightRange, calorieRange: calorieRange)
        guard let report = await engine.sync(host: self, api: ServerAPI(baseURL: serverURL), plan: plan) else { return }
        if !report.reachable {
            phase = .offline
        } else if let message = report.message {
            phase = .error(message)
        } else {
            phase = .synced
        }
        if report.refused > 0 {
            show("The server refused \(report.refused == 1 ? "a change" : "\(report.refused) changes"). See Settings → Sync.", isError: true)
        }
    }

    /// While the app is open, check every 30 seconds when something is waiting, otherwise every couple of minutes.
    func appBecameActive() {
        requestSync()
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            var idle = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard let self, !Task.isCancelled else { return }
                idle += 1
                if state.pendingCount > 0 || idle >= 4 {
                    idle = 0
                    startSync()
                }
            }
        }
    }

    func appWentToBackground() {
        pollTask?.cancel()
        pollTask = nil
        StoreFile.save(state)
        BackgroundSync.schedule()
    }

    func backgroundSync() async {
        BackgroundSync.schedule()
        await syncNow()
    }

    /// Checks the server without uploading anything (Settings → Test).
    func testConnection(_ address: String) async -> Bool {
        guard let url = ServerAPI.baseURL(from: address) else { return false }
        return await engine.isReachable(ServerAPI(baseURL: url))
    }

    // MARK: Settings

    var serverAddress: String { UserDefaults.standard.string(forKey: Defaults.server) ?? "" }

    /// Saves the server address; false if it isn't a URL.
    @discardableResult
    func saveServer(_ address: String) -> Bool {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            UserDefaults.standard.removeObject(forKey: Defaults.server)
            serverURL = nil
            phase = .notConfigured
            return true
        }
        guard let url = ServerAPI.baseURL(from: trimmed) else { return false }
        UserDefaults.standard.set(url.absoluteString, forKey: Defaults.server)
        serverURL = url
        phase = .idle
        requestSync()
        return true
    }

    func saveAPIKey(_ key: String) {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Keychain.write(trimmed, account: Keychain.apiKey)
        hasAPIKey = true
    }

    func removeAPIKey() {
        Keychain.delete(Keychain.apiKey)
        hasAPIKey = false
    }

    func show(_ message: String, isError: Bool = false) {
        toast = Toast(message: message, isError: isError)
    }

    // MARK: Changes

    /// Estimates and saves a meal. Returns whether it was saved (the composer then clears).
    func submit(text: String, date: String, mealType requested: MealType?) async -> Bool {
        let now = Date()
        let today = LocalDate.today(now)
        let localTime = date == today ? LocalDate.localTime(now) : nil
        let queued = QueuedText(date: date, loggedAt: now, text: text, mealType: requested)

        guard let apiKey = Keychain.read(Keychain.apiKey) else {
            state.queueText(queued)
            changed()
            show("Saved. Your server will estimate it when the phone syncs.")
            return true
        }
        let context: EstimateInput.Context
        if let localTime {
            context = .localTime(localTime)
        } else {
            context = .pastDay(LocalDate.shortLabel(date, today: today))
        }
        do {
            let estimate = try await ClaudeEstimator(apiKey: apiKey, transport: transport)
                .estimate(EstimateInput(text: text, context: context))
            state.addEntry(estimate.localEntry(text: text, date: date, loggedAt: now, requestedMealType: requested, localTime: localTime))
            changed()
            return true
        } catch EstimateError.network(_) {
            // No internet at all: keep the text, and let the server estimate it later.
            state.queueText(queued)
            changed()
            show("Couldn't reach Claude. Saved; it'll be estimated when the phone syncs.")
            return true
        } catch let EstimateError.notFood(reason) {
            show("That doesn't look like food: \(reason)", isError: true)
            return false
        } catch {
            show((error as? LocalizedError)?.errorDescription ?? "Couldn't estimate that. Try again.", isError: true)
            return false
        }
    }

    func updateItem(_ ref: RecordRef, _ patch: ItemPatch) {
        state.updateItem(ref, patch)
        changed()
    }

    func deleteItem(_ ref: RecordRef) {
        state.deleteItem(ref)
        changed()
    }

    func setMealType(_ ref: RecordRef, _ mealType: MealType) {
        state.setMealType(ref, mealType)
        changed()
    }

    func deleteEntry(_ ref: RecordRef) {
        state.deleteEntry(ref)
        changed()
    }

    func addBurn(date: String, calories: Int, note: String?) {
        state.addBurn(LocalBurn(date: date, loggedAt: Date(), calories: calories, note: note))
        changed()
    }

    func updateBurn(_ ref: RecordRef, calories: Int, note: String) {
        state.updateBurn(ref, BurnPatch(calories: calories, note: note))
        changed()
    }

    func deleteBurn(_ ref: RecordRef) {
        state.deleteBurn(ref)
        changed()
    }

    func setWeight(date: String, weightLb: Double) {
        state.setWeight(date: date, weightLb: weightLb)
        changed()
    }

    func deleteWeight(date: String) {
        state.deleteWeight(date: date)
        changed()
    }

    func saveGoals(_ goals: Goals) {
        state.setGoals(goals)
        changed()
    }

    func retry(_ id: UUID) {
        state.retry(id)
        changed()
    }

    func discard(_ id: UUID) {
        state.discard(id)
        changed()
    }
}

/// The phone's copy of everything, as JSON in Application Support.
enum StoreFile {
    private static var url: URL {
        URL.applicationSupportDirectory.appending(path: "store.json")
    }

    static func load() -> StoreState? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONCoding.storeDecoder.decode(StoreState.self, from: data)
    }

    static func save(_ state: StoreState) {
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            // Readable after the first unlock, so a background sync can use it.
            try JSONCoding.storeEncoder.encode(state).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            print("[store] save failed: \(error)")
        }
    }
}

enum BackgroundSync {
    /// Listed under BGTaskSchedulerPermittedIdentifiers in CalorieTracker-Info.plist.
    static var identifier: String { (Bundle.main.bundleIdentifier ?? "CalorieTracker") + ".sync" }

    /// Asks iOS for a background refresh in 15 minutes or later; iOS decides when, based on how the app is used.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}

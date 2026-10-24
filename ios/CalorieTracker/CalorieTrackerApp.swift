import SwiftUI

@main
struct CalorieTrackerApp: App {
    @State private var model = AppModel.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: model.appBecameActive()
            case .background: model.appWentToBackground()
            default: break
            }
        }
        // iOS runs this now and then while the app is closed; it's how changes go up without opening the app.
        .backgroundTask(.appRefresh(BackgroundSync.identifier)) {
            await AppModel.shared.backgroundSync()
        }
    }
}

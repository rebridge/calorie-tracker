import CalorieCore
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var showSettings = false

    var body: some View {
        TabView {
            NavigationStack { LogScreen(showSettings: $showSettings) }
                .tabItem { Label("Log", systemImage: "square.and.pencil") }
            NavigationStack { DayScreen(showSettings: $showSettings) }
                .tabItem { Label("Day", systemImage: "calendar") }
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack { SettingsScreen() }
        }
        .overlay(alignment: .top) { ToastView() }
    }
}

/// The sync status on the left and Settings on the right, on both tabs.
struct AppToolbar: ViewModifier {
    @Binding var showSettings: Bool

    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItem(placement: .topBarLeading) { SyncStatusButton(showSettings: $showSettings) }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Settings")
            }
        }
    }
}

extension View {
    func appToolbar(showSettings: Binding<Bool>) -> some View {
        modifier(AppToolbar(showSettings: showSettings))
    }
}

/// Tap to sync now. Shows whether the home server answered and how many changes are waiting on the phone.
struct SyncStatusButton: View {
    @Environment(AppModel.self) private var model
    @Binding var showSettings: Bool

    var body: some View {
        let pending = model.state.pendingCount
        let failed = model.state.failedRecords.count
        Button {
            if model.phase == .notConfigured || failed > 0 {
                showSettings = true
            } else {
                Task { await model.syncNow() }
            }
        } label: {
            HStack(spacing: 4) {
                switch model.phase {
                case .syncing:
                    ProgressView().controlSize(.small)
                case .notConfigured:
                    Image(systemName: "house.slash")
                case .offline:
                    Image(systemName: "wifi.slash")
                case .error:
                    Image(systemName: "exclamationmark.icloud")
                case .idle, .synced:
                    Image(systemName: failed > 0 ? "exclamationmark.triangle" : pending > 0 ? "arrow.up.circle" : "checkmark.icloud")
                }
                if failed > 0 {
                    Text("\(failed) failed").foregroundStyle(.red)
                } else if pending > 0 {
                    Text("\(pending) waiting")
                }
            }
            .font(.footnote)
        }
        .accessibilityLabel(accessibilityText(pending: pending, failed: failed))
    }

    private func accessibilityText(pending: Int, failed: Int) -> String {
        switch model.phase {
        case .notConfigured: return "No server set up"
        case .offline: return "Server not reachable, \(pending) changes waiting"
        case .syncing: return "Syncing"
        case let .error(message): return "Sync error: \(message)"
        case .idle, .synced: return failed > 0 ? "\(failed) changes failed" : "\(pending) changes waiting"
        }
    }
}

struct ToastView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if let toast = model.toast {
            Text(toast.message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(toast.isError ? AnyShapeStyle(Color.red.opacity(0.9)) : AnyShapeStyle(.thinMaterial), in: Capsule())
                .foregroundStyle(toast.isError ? Color.white : Color.primary)
                .padding(.horizontal)
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
                .onTapGesture { model.toast = nil }
                .task(id: toast.id) {
                    try? await Task.sleep(for: .seconds(toast.isError ? 5 : 3))
                    if model.toast?.id == toast.id {
                        withAnimation { model.toast = nil }
                    }
                }
        }
    }
}

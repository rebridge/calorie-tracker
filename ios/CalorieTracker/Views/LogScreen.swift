import CalorieCore
import SwiftUI

/// Today's meals with the composer pinned to the bottom.
struct LogScreen: View {
    @Environment(AppModel.self) private var model
    @Binding var showSettings: Bool
    @State private var editingItem: ItemRow?

    var body: some View {
        let today = LocalDate.today()
        let day = model.state.day(today)
        List {
            if model.phase == .notConfigured {
                Section {
                    Button { showSettings = true } label: {
                        Label("Add your home server in Settings to sync. Until then, everything stays on this phone.", systemImage: "house")
                    }
                }
            }
            Section {
                HStack {
                    Text(day.remainingKcal < 0 ? "Over budget" : "Remaining")
                        .foregroundStyle(day.remainingKcal < 0 ? Color.red : Color.secondary)
                    Spacer()
                    Text("\(day.remainingKcal.formatted()) kcal")
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(day.remainingKcal < 0 ? Color.red : Color.primary)
                }
            }
            MealLogSections(day: day, editingItem: $editingItem)
        }
        .navigationTitle("Today")
        .appToolbar(showSettings: $showSettings)
        .refreshable { await model.syncNow() }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { ComposerBar(date: today) }
        .sheet(item: $editingItem) { ItemEditSheet(item: $0) }
    }
}

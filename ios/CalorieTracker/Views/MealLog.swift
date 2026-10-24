import CalorieCore
import SwiftUI

/// The day's meals, Breakfast → Snack. Each entry is a header row (what was typed) followed by its items.
struct MealLogSections: View {
    let day: DayView
    @Binding var editingItem: ItemRow?

    var body: some View {
        let meals = day.meals.filter { !$0.entries.isEmpty }
        if meals.isEmpty {
            Section {
                Text("Nothing logged").foregroundStyle(.secondary)
            }
        }
        ForEach(meals) { meal in
            Section {
                ForEach(meal.entries) { entry in
                    EntryHeaderRow(entry: entry)
                    ForEach(entry.items) { item in
                        ItemRowView(item: item) { editingItem = item }
                    }
                }
            } header: {
                HStack {
                    Text(meal.mealType.label)
                    Spacer()
                    Text("\(meal.calories.formatted()) kcal")
                }
            }
        }
    }
}

struct EntryHeaderRow: View {
    @Environment(AppModel.self) private var model
    let entry: EntryRow

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.rawText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                HStack(spacing: 6) {
                    Text(entry.createdAt, format: .dateTime.hour().minute())
                    StatusBadge(status: entry.status)
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
            Spacer()
            if entry.status != .awaitingEstimate {
                Text("\(entry.calories.formatted()) kcal").font(.subheadline.weight(.semibold).monospacedDigit())
            }
            Menu {
                Picker("Meal", selection: Binding(get: { entry.mealType }, set: { model.setMealType(entry.id, $0) })) {
                    ForEach(MealType.allCases) { Text($0.label).tag($0) }
                }
                Button("Delete entry", systemImage: "trash", role: .destructive) { model.deleteEntry(entry.id) }
            } label: {
                Image(systemName: "ellipsis.circle").padding(.leading, 4)
            }
            .accessibilityLabel("Entry options")
        }
        .swipeActions {
            Button("Delete", role: .destructive) { model.deleteEntry(entry.id) }
        }
    }
}

struct ItemRowView: View {
    @Environment(AppModel.self) private var model
    let item: ItemRow
    let onEdit: () -> Void
    @State private var showAssumption = false

    var body: some View {
        // Not a Button: the low-confidence badge inside is its own button, and buttons don't nest.
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.name)
                    if item.confidence == .low {
                        Button { showAssumption = true } label: {
                            Text("Low confidence")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.2), in: Capsule())
                                .foregroundStyle(.orange)
                        }
                        .buttonStyle(.borderless)
                        .popover(isPresented: $showAssumption) {
                            Text(item.assumption ?? "No assumption given")
                                .padding()
                                .presentationCompactAdaptation(.popover)
                        }
                    }
                    if item.edited {
                        Image(systemName: "pencil").font(.caption2).foregroundStyle(.secondary)
                            .accessibilityLabel("Edited")
                    }
                }
                Text(item.portion).font(.caption).foregroundStyle(.secondary)
                Text("P \(grams(item.proteinG)) · C \(grams(item.carbsG)) · F \(grams(item.fatG))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(item.calories.formatted())").monospacedDigit()
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onEdit)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: "Edit", onEdit)
        .padding(.leading, 8)
        .swipeActions {
            Button("Delete", role: .destructive) { model.deleteItem(item.id) }
        }
    }
}

/// Says when a row isn't on the server yet. Nothing for synced rows.
struct StatusBadge: View {
    let status: RowStatus

    var body: some View {
        switch status {
        case .synced:
            EmptyView()
        case .pending:
            Label("Waiting to sync", systemImage: "arrow.up.circle")
                .font(.caption).foregroundStyle(.secondary)
        case .awaitingEstimate:
            Label("Estimated when it syncs", systemImage: "hourglass")
                .font(.caption).foregroundStyle(.orange)
        case let .failed(reason):
            Label("Sync failed: \(reason)", systemImage: "exclamationmark.triangle")
                .font(.caption).foregroundStyle(.red).lineLimit(2)
        }
    }
}

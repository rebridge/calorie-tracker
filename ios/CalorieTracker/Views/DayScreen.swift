import CalorieCore
import SwiftUI

/// Any day: the budget, macros, meals, burns, weight and trends. Opens on today; swipe or use the arrows to move.
struct DayScreen: View {
    @Environment(AppModel.self) private var model
    @Binding var showSettings: Bool
    @State private var date = LocalDate.today()
    @State private var showCalendar = false
    @State private var editingItem: ItemRow?
    @State private var editingBurn: BurnRow?
    @State private var editingWeight = false

    var body: some View {
        let today = LocalDate.today()
        let day = model.state.day(date)
        List {
            Section {
                BudgetCard(day: day)
                    // Swipe the card to change days. Only the card: rows below swipe to delete.
                    .gesture(
                        DragGesture(minimumDistance: 30).onEnded { value in
                            // Same rule as the web app: far enough, and mostly sideways (not a scroll).
                            let dx = value.translation.width
                            let dy = value.translation.height
                            guard abs(dx) >= 60, abs(dx) >= 2 * abs(dy) else { return }
                            step(dx > 0 ? -1 : 1)
                        }
                    )
                MacroBars(day: day)
            }
            if day.fetchedAt == nil, model.phase != .notConfigured, date != today {
                Section {
                    Label("Not loaded from the server yet. It loads the next time the phone syncs.", systemImage: "icloud.slash")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            MealLogSections(day: day, editingItem: $editingItem)
            BurnsSection(day: day, editing: $editingBurn)
            WeightSection(day: day, editing: $editingWeight)
            Section("Calories vs goal") {
                CalorieTrendChart(viewedDate: date)
            }
            Section("Weight trend") {
                WeightTrendChart(viewedDate: date)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 4) {
                    Button { step(-1) } label: { Image(systemName: "chevron.left") }
                        .accessibilityLabel("Previous day")
                    Button { showCalendar = true } label: {
                        Text(LocalDate.dayLabel(date, today: today)).font(.headline).frame(minWidth: 110)
                    }
                    .accessibilityLabel("Pick a date")
                    Button { step(1) } label: { Image(systemName: "chevron.right") }
                        .disabled(date >= today)
                        .accessibilityLabel("Next day")
                }
            }
        }
        .appToolbar(showSettings: $showSettings)
        .refreshable { await model.syncNow() }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) { ComposerBar(date: date) }
        .onAppear { model.viewedDate = date }
        .onChange(of: date) { _, newDate in
            model.viewedDate = newDate
            if model.state.days[newDate]?.fetchedAt == nil { model.requestSync(after: 0.3) }
        }
        .sheet(item: $editingItem) { ItemEditSheet(item: $0) }
        .sheet(item: $editingBurn) { BurnSheet(date: date, burn: $0) }
        .sheet(isPresented: $editingWeight) { WeightSheet(date: date) }
        .sheet(isPresented: $showCalendar) {
            DatePicker(
                "Date",
                selection: Binding(
                    get: { LocalDate.toDate(date) ?? Date() },
                    set: {
                        date = LocalDate.string(from: $0)
                        showCalendar = false
                    }
                ),
                in: ...Date(),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .padding()
            .presentationDetents([.medium])
        }
    }

    private func step(_ days: Int) {
        let next = LocalDate.addDays(date, days)
        guard next <= LocalDate.today() else { return }
        withAnimation { date = next }
    }
}

/// Remaining = goal − eaten + burned, with the three numbers underneath. Red when over.
struct BudgetCard: View {
    let day: DayView

    var body: some View {
        let over = day.remainingKcal < 0
        VStack(alignment: .leading, spacing: 12) {
            Text(over ? "Over budget" : "Remaining")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(over ? Color.red : Color.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(day.remainingKcal.formatted())
                    .font(.system(size: 44, weight: .bold).monospacedDigit())
                    .contentTransition(.numericText())
                Text("kcal").font(.subheadline).foregroundStyle(.secondary)
            }
            .foregroundStyle(over ? Color.red : Color.primary)
            Divider()
            HStack {
                stat("Eaten", day.totals.eatenKcal)
                stat("Burned", day.totals.burnedKcal)
                stat("Goal", day.goals.calorieGoal)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func stat(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value.formatted()).font(.headline.monospacedDigit())
        }
        .frame(maxWidth: .infinity)
    }
}

struct MacroBars: View {
    let day: DayView

    var body: some View {
        VStack(spacing: 10) {
            bar("Protein", day.totals.proteinG, day.goals.proteinGoalG, .blue)
            bar("Carbs", day.totals.carbsG, day.goals.carbsGoalG, .orange)
            bar("Fat", day.totals.fatG, day.goals.fatGoalG, .pink)
        }
        .padding(.vertical, 4)
    }

    private func bar(_ label: String, _ value: Double, _ goal: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.subheadline)
                Spacer()
                Text("\(grams(value)) / \(goal) g").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
            }
            // Caps at full so going over a goal doesn't overflow the bar.
            ProgressView(value: min(max(value, 0), Double(max(goal, 1))), total: Double(max(goal, 1)))
                .tint(color)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Grams with at most one decimal, like the web app.
func grams(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0...1)))
}

struct BurnsSection: View {
    @Environment(AppModel.self) private var model
    let day: DayView
    @Binding var editing: BurnRow?

    var body: some View {
        if !day.burns.isEmpty {
            Section {
                ForEach(day.burns) { burn in
                    Button { editing = burn } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(burn.note ?? "Burned")
                                StatusBadge(status: burn.status)
                            }
                            Spacer()
                            Text("\(burn.calories.formatted()) kcal").monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                    .swipeActions {
                        Button("Delete", role: .destructive) { model.deleteBurn(burn.id) }
                    }
                }
            } header: {
                HStack {
                    Text("Burned")
                    Spacer()
                    Text("\(day.totals.burnedKcal.formatted()) kcal")
                }
            }
        }
    }
}

struct WeightSection: View {
    let day: DayView
    @Binding var editing: Bool

    var body: some View {
        Section("Weight") {
            Button { editing = true } label: {
                HStack {
                    if let weight = day.weight {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(grams(weight.weightLb)) lb").font(.title3.weight(.semibold).monospacedDigit())
                            StatusBadge(status: weight.status)
                        }
                        Spacer()
                        Text("Edit").foregroundStyle(.tint)
                    } else {
                        Label("Log weight for this day", systemImage: "scalemass")
                    }
                }
            }
            .foregroundStyle(.primary)
        }
    }
}

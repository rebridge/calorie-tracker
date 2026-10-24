import CalorieCore
import SwiftUI

/// Reads a number typed with either decimal separator.
private func number(_ text: String) -> Double? {
    Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
}

private func numberText(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0...1)).grouping(.never))
}

/// Edit every field of an item, or delete it. Saving marks it edited.
struct ItemEditSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let item: ItemRow
    @State private var name: String
    @State private var portion: String
    @State private var calories: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String

    init(item: ItemRow) {
        self.item = item
        _name = State(initialValue: item.name)
        _portion = State(initialValue: item.portion)
        _calories = State(initialValue: String(item.calories))
        _protein = State(initialValue: numberText(item.proteinG))
        _carbs = State(initialValue: numberText(item.carbsG))
        _fat = State(initialValue: numberText(item.fatG))
    }

    private var patch: ItemPatch? {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let trimmedPortion = portion.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty, !trimmedPortion.isEmpty,
              let kcal = number(calories), let p = number(protein), let c = number(carbs), let f = number(fat),
              kcal >= 0, p >= 0, c >= 0, f >= 0
        else { return nil }
        let rounded = Int(kcal.rounded())
        return ItemPatch(
            name: trimmedName == item.name ? nil : trimmedName,
            portion: trimmedPortion == item.portion ? nil : trimmedPortion,
            calories: rounded == item.calories ? nil : rounded,
            proteinG: p == item.proteinG ? nil : p,
            carbsG: c == item.carbsG ? nil : c,
            fatG: f == item.fatG ? nil : f
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Portion", text: $portion)
                }
                Section("Nutrition") {
                    field("Calories", unit: "kcal", text: $calories)
                    field("Protein", unit: "g", text: $protein)
                    field("Carbs", unit: "g", text: $carbs)
                    field("Fat", unit: "g", text: $fat)
                }
                if item.assumption != nil || item.confidence != .high {
                    Section("Claude's estimate") {
                        LabeledContent("Confidence", value: item.confidence.rawValue.capitalized)
                        if let assumption = item.assumption { Text(assumption).foregroundStyle(.secondary) }
                    }
                }
                Section {
                    Button("Delete item", role: .destructive) {
                        model.deleteItem(item.id)
                        dismiss()
                    }
                }
            }
            .navigationTitle("Edit item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if let patch, patch != ItemPatch() { model.updateItem(item.id, patch) }
                        dismiss()
                    }
                    .disabled(patch == nil)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func field(_ label: String, unit: String, text: Binding<String>) -> some View {
        LabeledContent(label) {
            HStack {
                TextField(label, text: text)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                Text(unit).foregroundStyle(.secondary)
            }
        }
    }
}

/// Log calories burned, or edit or delete a burn.
struct BurnSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    let burn: BurnRow?
    @State private var calories: String
    @State private var note: String

    init(date: String, burn: BurnRow?) {
        self.date = date
        self.burn = burn
        _calories = State(initialValue: burn.map { String($0.calories) } ?? "")
        _note = State(initialValue: burn?.note ?? "")
    }

    private var kcal: Int? {
        guard let value = Int(calories.trimmingCharacters(in: .whitespaces)), value > 0 else { return nil }
        return value
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Calories") {
                        HStack {
                            TextField("300", text: $calories).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                            Text("kcal").foregroundStyle(.secondary)
                        }
                    }
                    TextField("Note (optional), e.g. evening run", text: $note)
                        .onChange(of: note) { _, value in if value.count > 200 { note = String(value.prefix(200)) } }
                }
                if let burn {
                    Section {
                        Button("Delete", role: .destructive) {
                            model.deleteBurn(burn.id)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(burn == nil ? "Calories burned" : "Edit burn")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let kcal else { return }
                        let trimmed = note.trimmingCharacters(in: .whitespaces)
                        if let burn {
                            model.updateBurn(burn.id, calories: kcal, note: trimmed)
                        } else {
                            model.addBurn(date: date, calories: kcal, note: trimmed.isEmpty ? nil : trimmed)
                        }
                        dismiss()
                    }
                    .disabled(kcal == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

/// The day's weight in lb: one per day, and a new one replaces the old.
struct WeightSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let date: String
    @State private var weight = ""
    @State private var loaded = false

    /// "today", "yesterday" or "Mon, Oct 13".
    private var dayName: String {
        let label = LocalDate.dayLabel(date, today: LocalDate.today())
        return date >= LocalDate.addDays(LocalDate.today(), -1) ? label.lowercased() : label
    }

    /// The server's limit (`MAX_WEIGHT_LB`).
    private var pounds: Double? {
        guard let value = number(weight), value > 0, value <= 1500 else { return nil }
        return value
    }

    var body: some View {
        let existing = model.state.day(date).weight
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Weight") {
                        HStack {
                            TextField("180.5", text: $weight).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                            Text("lb").foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    Text("For \(dayName). A new weight replaces the day's old one.")
                }
                if existing != nil {
                    Section {
                        Button("Delete weight", role: .destructive) {
                            model.deleteWeight(date: date)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("Weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let pounds else { return }
                        model.setWeight(date: date, weightLb: pounds)
                        dismiss()
                    }
                    .disabled(pounds == nil)
                }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                if let existing { weight = numberText(existing.weightLb) }
            }
        }
        .presentationDetents([.medium])
    }
}

import CalorieCore
import SwiftUI

/// The meal input pinned above the tab bar, with the + Burned and + Weight chips. Everything goes to `date`.
/// A past day also gets meal chips, since the time-of-day guess only applies to today.
struct ComposerBar: View {
    @Environment(AppModel.self) private var model
    let date: String
    @State private var text = ""
    @State private var mealType: MealType?
    @State private var submitting = false
    @State private var showBurn = false
    @State private var showWeight = false
    @FocusState private var focused: Bool

    /// The server's limit (`MAX_ENTRY_TEXT_LENGTH`).
    private let maxLength = 2000

    var body: some View {
        let today = LocalDate.today()
        let isPast = date != today
        let hasWeight = model.state.day(date).weight != nil
        let canSubmit = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !submitting

        VStack(spacing: 8) {
            HStack(spacing: 8) {
                chip("+ Burned", selected: false) { showBurn = true }
                chip(hasWeight ? "Edit weight" : "+ Weight", selected: false) { showWeight = true }
                Spacer()
            }
            if isPast {
                // Tap to pick a meal, tap again to clear it; unpicked, Claude's guess (or snack) is used.
                HStack(spacing: 6) {
                    ForEach(MealType.allCases) { meal in
                        chip(meal.label, selected: mealType == meal) { mealType = mealType == meal ? nil : meal }
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(isPast ? "Add to \(LocalDate.shortLabel(date, today: today))…" : "What did you eat?", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($focused)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                    .onChange(of: text) { _, value in
                        if value.count > maxLength { text = String(value.prefix(maxLength)) }
                    }
                Button {
                    Task { await submit(isPast: isPast) }
                } label: {
                    if submitting {
                        ProgressView().frame(width: 36, height: 36)
                    } else {
                        Image(systemName: "arrow.up.circle.fill").font(.system(size: 34))
                    }
                }
                .disabled(!canSubmit)
                .accessibilityLabel("Log it")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
        .sheet(isPresented: $showBurn) { BurnSheet(date: date, burn: nil) }
        .sheet(isPresented: $showWeight) { WeightSheet(date: date) }
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .frame(minHeight: 34)
                .background(selected ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.secondarySystemBackground)), in: Capsule())
                .foregroundStyle(selected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func submit(isPast: Bool) async {
        let sent = text
        submitting = true
        // On failure the text (and chosen meal) stay put, so nothing typed is lost.
        if await model.submit(text: sent, date: date, mealType: isPast ? mealType : nil) {
            if text == sent { text = "" }
            mealType = nil
        }
        submitting = false
    }
}

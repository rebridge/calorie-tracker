import CalorieCore
import Charts
import SwiftUI

/// Each day's net calories (eaten − burned) against the goal, as of the last sync plus changes made since.
struct CalorieTrendChart: View {
    @Environment(AppModel.self) private var model
    let viewedDate: String

    var body: some View {
        @Bindable var model = model
        let trend = model.state.calorieTrend(model.calorieRange)
        VStack(alignment: .leading, spacing: 12) {
            Picker("Range", selection: $model.calorieRange) {
                ForEach(TrendRange.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: model.calorieRange) { _, _ in model.requestSync() }

            if let trend, !trend.points.isEmpty {
                Chart {
                    ForEach(trend.points, id: \.date) { point in
                        let net = max(0, point.eatenKcal - point.burnedKcal)
                        if let day = LocalDate.toDate(point.date) {
                            BarMark(x: .value("Day", day, unit: .day), y: .value("Net kcal", net))
                                .foregroundStyle(net > trend.goalKcal ? Color.red.opacity(0.8) : Color.accentColor)
                        }
                    }
                    RuleMark(y: .value("Goal", trend.goalKcal))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .foregroundStyle(.secondary)
                        .annotation(position: .top, alignment: .leading) {
                            Text("Goal \(trend.goalKcal.formatted())").font(.caption2).foregroundStyle(.secondary)
                        }
                    if let viewed = LocalDate.toDate(viewedDate) {
                        RuleMark(x: .value("Viewing", viewed, unit: .day))
                            .foregroundStyle(Color.gray.opacity(0.35))
                    }
                }
                .frame(height: 180)
            } else {
                Text(model.phase == .notConfigured ? "Charts load from your server." : "Nothing in this range yet.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 60)
            }
        }
        .padding(.vertical, 4)
    }
}

/// Weight readings with their 7-day moving average, as of the last sync.
struct WeightTrendChart: View {
    @Environment(AppModel.self) private var model
    let viewedDate: String

    private var hasPendingWeights: Bool {
        model.state.outbox.contains {
            switch $0.op {
            case .putWeight, .deleteWeight: return true
            default: return false
            }
        }
    }

    var body: some View {
        @Bindable var model = model
        let trend = model.state.weightTrends[model.weightRange.rawValue]
        VStack(alignment: .leading, spacing: 12) {
            Picker("Range", selection: $model.weightRange) {
                ForEach(TrendRange.weightRanges) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .onChange(of: model.weightRange) { _, _ in model.requestSync() }

            if let trend, !trend.points.isEmpty {
                Chart {
                    ForEach(trend.points, id: \.date) { point in
                        if let day = LocalDate.toDate(point.date) {
                            PointMark(x: .value("Day", day, unit: .day), y: .value("Weight", point.weightLb))
                                .foregroundStyle(Color.secondary)
                                .symbolSize(20)
                        }
                    }
                    ForEach(trend.movingAvg, id: \.date) { point in
                        if let day = LocalDate.toDate(point.date) {
                            LineMark(x: .value("Day", day, unit: .day), y: .value("7-day average", point.avgLb), series: .value("Series", "average"))
                                .foregroundStyle(Color.accentColor)
                                .interpolationMethod(.monotone)
                        }
                    }
                    if let viewed = LocalDate.toDate(viewedDate) {
                        RuleMark(x: .value("Viewing", viewed, unit: .day))
                            .foregroundStyle(Color.gray.opacity(0.35))
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .frame(height: 180)
                if hasPendingWeights {
                    Text("Weights logged on the phone show here after they sync.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text(model.phase == .notConfigured ? "Charts load from your server." : "No weights in this range yet.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 60)
            }
        }
        .padding(.vertical, 4)
    }
}

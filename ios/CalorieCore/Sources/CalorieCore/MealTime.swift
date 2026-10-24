/// The time-of-day fallback for today's entries, the same slots as the server (`server/src/meal-type.ts`).
public enum MealTime {
    private static func minutes(_ hhmm: String) -> Int {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }

    /// [start (inclusive), meal] in ascending order; each runs until the next start.
    private static let slots: [(Int, MealType)] = [
        (0, .breakfast),
        (10 * 60 + 30, .lunch),
        (14 * 60 + 30, .snack),
        (17 * 60, .dinner),
        (21 * 60, .snack),
    ]

    /// `time` is local HH:MM.
    public static func mealType(forTime time: String) -> MealType {
        let t = minutes(time)
        return slots.last { t >= $0.0 }?.1 ?? .breakfast
    }

    /// The requested meal type wins, then Claude's, then the time of day. A past day (no `localTime`) is a snack.
    public static func resolve(requested: MealType?, fromModel: MealType?, localTime: String?) -> MealType {
        requested ?? fromModel ?? localTime.map(mealType(forTime:)) ?? .snack
    }
}

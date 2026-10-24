import Foundation

/// Calendar dates as YYYY-MM-DD strings, the way the server keys days.
/// "Today" comes from the phone's own time zone; keep it the same as the server's `TZ`.
public enum LocalDate {
    public static func string(from date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    public static func today(_ now: Date = Date(), calendar: Calendar = .current) -> String {
        string(from: now, calendar: calendar)
    }

    /// The wall-clock time as HH:MM (24h), what the model and the meal-time fallback are given.
    public static func localTime(_ now: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.hour, .minute], from: now)
        return String(format: "%02d:%02d", c.hour!, c.minute!)
    }

    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private static func parts(_ date: String) -> DateComponents? {
        let pieces = date.split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3 else { return nil }
        return DateComponents(year: pieces[0], month: pieces[1], day: pieces[2])
    }

    /// The date `days` after `date` (negative goes back). Pure calendar math in UTC, so DST never shifts it.
    public static func addDays(_ date: String, _ days: Int) -> String {
        guard let c = parts(date), let start = utc.date(from: c),
              let moved = utc.date(byAdding: .day, value: days, to: start)
        else { return date }
        return string(from: moved, calendar: utc)
    }

    /// A YYYY-MM-DD as local midnight, which is what `DatePicker` works in.
    public static func toDate(_ date: String, calendar: Calendar = .current) -> Date? {
        parts(date).flatMap { calendar.date(from: $0) }
    }

    private static func formatted(_ date: String, format: String) -> String {
        guard let c = parts(date), let day = utc.date(from: c) else { return date }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = format
        return formatter.string(from: day)
    }

    /// "Mon, Oct 13", with the year ("Mon, Oct 13, 2025") when it isn't `today`'s year. Matches the server's label.
    public static func shortLabel(_ date: String, today: String) -> String {
        date.prefix(4) == today.prefix(4) ? formatted(date, format: "EEE, MMM d") : formatted(date, format: "EEE, MMM d, yyyy")
    }

    /// "Today", "Yesterday", or "Mon, Oct 13".
    public static func dayLabel(_ date: String, today: String) -> String {
        if date == today { return "Today" }
        if date == addDays(today, -1) { return "Yesterday" }
        return shortLabel(date, today: today)
    }
}

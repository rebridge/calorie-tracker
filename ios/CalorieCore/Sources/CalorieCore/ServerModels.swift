import Foundation

// Mirrors of the server's JSON (shared/src/*.ts). Decoded with `JSONCoding.api`, which maps snake_case keys.

public enum MealType: String, Codable, CaseIterable, Sendable, Identifiable {
    case breakfast, lunch, dinner, snack

    public var id: String { rawValue }
    public var label: String { rawValue.capitalized }
}

public enum Confidence: String, Codable, Sendable {
    case high, medium, low
}

/// The daily goals (`settings`): calories and protein/carbs/fat in grams.
public struct Goals: Codable, Equatable, Sendable {
    public var calorieGoal: Int
    public var proteinGoalG: Int
    public var carbsGoalG: Int
    public var fatGoalG: Int

    public init(calorieGoal: Int, proteinGoalG: Int, carbsGoalG: Int, fatGoalG: Int) {
        self.calorieGoal = calorieGoal
        self.proteinGoalG = proteinGoalG
        self.carbsGoalG = carbsGoalG
        self.fatGoalG = fatGoalG
    }

    /// The server's seeded defaults, shown until the first sync.
    public static let defaults = Goals(calorieGoal: 2000, proteinGoalG: 150, carbsGoalG: 200, fatGoalG: 65)
}

public struct ServerItem: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var entryId: Int
    public var name: String
    public var portion: String
    public var calories: Int
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
    public var confidence: Confidence
    public var assumption: String?
    public var edited: Bool
}

/// An entry with its items. The server also sends the summed macros; they're recomputed from the items instead.
public struct ServerEntry: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var createdAt: String
    public var localDate: String
    public var mealType: MealType
    public var rawText: String
    public var items: [ServerItem]
}

public struct ServerBurn: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var localDate: String
    public var calories: Int
    public var note: String?
    public var createdAt: String
}

public struct ServerWeight: Codable, Equatable, Sendable {
    public var weightLb: Double
    public var createdAt: String
}

/// `GET /api/day/:date`. Totals aren't decoded: the day view sums them after applying pending changes.
public struct DayResponse: Codable, Equatable, Sendable {
    public struct MealGroup: Codable, Equatable, Sendable {
        public var mealType: MealType
        public var entries: [ServerEntry]
    }

    public var date: String
    public var meals: [MealGroup]
    public var burns: [ServerBurn]
    public var weight: ServerWeight?
    public var goals: Goals
}

/// `GET`/`PUT /api/settings`.
public struct SettingsResponse: Codable, Equatable, Sendable {
    public struct TokenUsage: Codable, Equatable, Sendable {
        public var inputTokens: Int
        public var outputTokens: Int
    }

    public var calorieGoal: Int
    public var proteinGoalG: Int
    public var carbsGoalG: Int
    public var fatGoalG: Int
    public var model: String
    public var databasePath: String
    public var tokenUsage: TokenUsage

    public var goals: Goals {
        Goals(calorieGoal: calorieGoal, proteinGoalG: proteinGoalG, carbsGoalG: carbsGoalG, fatGoalG: fatGoalG)
    }
}

/// `GET /api/weights?range=…`: readings plus their trailing 7-day average.
public struct WeightsResponse: Codable, Equatable, Sendable {
    public struct Point: Codable, Equatable, Sendable {
        public var date: String
        public var weightLb: Double
    }

    public struct Average: Codable, Equatable, Sendable {
        public var date: String
        public var avgLb: Double
    }

    public var range: String
    public var from: String
    public var today: String
    public var points: [Point]
    public var movingAvg: [Average]
}

/// `GET /api/calories?range=…`: calories eaten and burned per day that has either.
public struct CaloriesResponse: Codable, Equatable, Sendable {
    public struct Point: Codable, Equatable, Sendable {
        public var date: String
        public var eatenKcal: Int
        public var burnedKcal: Int

        public init(date: String, eatenKcal: Int, burnedKcal: Int) {
            self.date = date
            self.eatenKcal = eatenKcal
            self.burnedKcal = burnedKcal
        }
    }

    public var range: String
    public var from: String
    public var today: String
    public var goalKcal: Int
    public var points: [Point]
}

/// The ranges the trend charts offer, as the API spells them.
public enum TrendRange: String, CaseIterable, Sendable, Identifiable {
    case week = "7d", month = "30d", quarter = "90d", year = "1y"

    public var id: String { rawValue }
    public var label: String { rawValue }
    /// The weight trend has no week view.
    public static let weightRanges: [TrendRange] = [.month, .quarter, .year]
}

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Calls the Claude API straight from the phone, so meals get estimated without the home server.
/// Same model, prompt and output schema as the server (`server/src/claude.ts`).
public struct ClaudeEstimator: Sendable {
    public static let model = "claude-haiku-5-5"
    public static let apiVersion = "2026-10-21"
    public static let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    public static let systemPrompt =
        "You are a nutrition estimator. Break the user's description into individual food or drink items. " +
        "Use standard US nutrition data. When a portion is vague, assume a typical serving, state the assumption, " +
        "and lower the confidence. Only set meal_type if the user says it."

    public let apiKey: String
    public let transport: HTTPTransport

    public init(apiKey: String, transport: HTTPTransport) {
        self.apiKey = apiKey
        self.transport = transport
    }

    public func estimate(_ input: EstimateInput) async throws -> Estimate {
        let request = try Self.makeRequest(apiKey: apiKey, input: input)
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.send(request)
        } catch {
            throw EstimateError.network(error.localizedDescription)
        }
        return try Self.parse(data: data, status: response.statusCode)
    }

    /// The JSON schema Claude's reply must follow (the server's `MealSchema`).
    static var outputSchema: [String: Any] {
        let nullableString: [String: Any] = ["anyOf": [["type": "string"], ["type": "null"]]]
        let item: [String: Any] = [
            "type": "object",
            "properties": [
                "name": ["type": "string"],
                "portion": ["type": "string"],
                "calories": ["type": "number"],
                "protein_g": ["type": "number"],
                "carbs_g": ["type": "number"],
                "fat_g": ["type": "number"],
                "confidence": ["type": "string", "enum": ["high", "medium", "low"]],
                "assumption": nullableString,
            ],
            "required": ["name", "portion", "calories", "protein_g", "carbs_g", "fat_g", "confidence", "assumption"],
            "additionalProperties": false,
        ]
        return [
            "type": "object",
            "properties": [
                "meal_type": ["anyOf": [["type": "string", "enum": MealType.allCases.map(\.rawValue)], ["type": "null"]]],
                "items": ["type": "array", "items": item],
                // Set when the input isn't food ("hello", "ran 3 miles").
                "not_food_reason": nullableString,
            ],
            "required": ["meal_type", "items", "not_food_reason"],
            "additionalProperties": false,
        ]
    }

    static func makeRequest(apiKey: String, input: EstimateInput) throws -> URLRequest {
        var request = URLRequest(url: endpoint, timeoutInterval: 60)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 4000,
            // Medium is already Haiku 5.5's default; set explicitly like the server does. Thinking stays adaptive.
            "output_config": ["effort": "medium", "format": ["type": "json_schema", "schema": outputSchema]],
            "system": systemPrompt,
            "messages": [["role": "user", "content": input.userMessage]],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        return request
    }

    private struct Reply: Decodable {
        struct Block: Decodable {
            var type: String
            var text: String?
        }

        struct Usage: Decodable {
            var inputTokens: Int
            var outputTokens: Int
        }

        var model: String
        var stopReason: String?
        var content: [Block]
        var usage: Usage
    }

    private struct ErrorReply: Decodable {
        struct Detail: Decodable {
            var type: String
            var message: String
        }

        var error: Detail
    }

    /// Claude's structured output, read leniently like the server's `MealSchema`: an unknown meal type becomes
    /// nil (the time-of-day fallback applies) and an unknown confidence becomes low.
    private struct RawMeal: Decodable {
        struct Item: Decodable {
            var name: String
            var portion: String
            var calories: Double
            var proteinG: Double
            var carbsG: Double
            var fatG: Double
            var confidence: String?
            var assumption: String?
        }

        var mealType: String?
        var items: [Item]
        var notFoodReason: String?
    }

    static func parse(data: Data, status: Int) throws -> Estimate {
        guard (200..<300).contains(status) else {
            let message = (try? JSONCoding.apiDecoder.decode(ErrorReply.self, from: data))?.error.message ?? "HTTP \(status)"
            throw EstimateError.api(status: status, message: message)
        }
        let reply: Reply
        do {
            reply = try JSONCoding.apiDecoder.decode(Reply.self, from: data)
        } catch {
            throw EstimateError.schema("Unexpected reply from the Claude API")
        }
        if reply.stopReason == "refusal" { throw EstimateError.refusal }
        if reply.stopReason == "max_tokens" { throw EstimateError.maxTokens }
        // Haiku 5.5 thinks by default, so thinking blocks can come before the JSON text block.
        guard let text = reply.content.first(where: { $0.type == "text" })?.text,
              let raw = try? JSONCoding.apiDecoder.decode(RawMeal.self, from: Data(text.utf8))
        else { throw EstimateError.schema("The model's reply didn't match the expected format") }

        let normalize = { (value: String?) in value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let meal = MealEstimate(
            mealType: normalize(raw.mealType).flatMap(MealType.init(rawValue:)),
            items: raw.items.map {
                EstimatedItem(
                    name: $0.name, portion: $0.portion, calories: $0.calories, proteinG: $0.proteinG,
                    carbsG: $0.carbsG, fatG: $0.fatG,
                    confidence: normalize($0.confidence).flatMap(Confidence.init(rawValue:)) ?? .low,
                    assumption: $0.assumption
                )
            },
            notFoodReason: raw.notFoodReason
        )
        if meal.items.isEmpty || meal.notFoodReason != nil {
            throw EstimateError.notFood(meal.notFoodReason ?? "No food or drink found")
        }
        return Estimate(
            meal: meal, model: reply.model, rawResponse: String(decoding: data, as: UTF8.self),
            inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens
        )
    }
}

/// What the model is told about when the meal was eaten: today's local time, or for a past day its label and no
/// time, since the time it's logged says nothing about the meal.
public struct EstimateInput: Sendable {
    public enum Context: Equatable, Sendable {
        case localTime(String)
        case pastDay(String)
    }

    public var text: String
    public var context: Context

    public init(text: String, context: Context) {
        self.text = text
        self.context = context
    }

    public var userMessage: String {
        switch context {
        case let .localTime(time): return "Local time: \(time)\n\n\(text)"
        case let .pastDay(label): return "Logging for a past day (\(label))\n\n\(text)"
        }
    }
}

public struct EstimatedItem: Equatable, Sendable {
    public var name: String
    public var portion: String
    public var calories: Double
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
    public var confidence: Confidence
    public var assumption: String?
}

public struct MealEstimate: Equatable, Sendable {
    public var mealType: MealType?
    public var items: [EstimatedItem]
    public var notFoodReason: String?
}

public struct Estimate: Equatable, Sendable {
    public var meal: MealEstimate
    public var model: String
    /// The reply body as received, stored as the entry's audit trail.
    public var rawResponse: String
    public var inputTokens: Int
    public var outputTokens: Int

    /// The entry to save. Rounded and floored at 0 the way the server stores items.
    public func localEntry(
        text: String, date: String, loggedAt: Date, requestedMealType: MealType?, localTime: String?
    ) -> LocalEntry {
        LocalEntry(
            date: date, loggedAt: loggedAt,
            mealType: MealTime.resolve(requested: requestedMealType, fromModel: meal.mealType, localTime: localTime),
            text: text, model: model, modelResponse: rawResponse, inputTokens: inputTokens, outputTokens: outputTokens,
            items: meal.items.map {
                LocalItem(
                    name: $0.name, portion: $0.portion, calories: Int(max(0, $0.calories).rounded()),
                    proteinG: round1(max(0, $0.proteinG)), carbsG: round1(max(0, $0.carbsG)), fatG: round1(max(0, $0.fatG)),
                    confidence: $0.confidence, assumption: $0.assumption
                )
            }
        )
    }
}

public enum EstimateError: Error, Equatable, LocalizedError {
    /// Couldn't reach the Claude API at all (no connection).
    case network(String)
    case api(status: Int, message: String)
    case refusal
    case maxTokens
    case schema(String)
    /// Claude found no food in the text; nothing is saved.
    case notFood(String)

    public var errorDescription: String? {
        switch self {
        case let .network(message): return "Couldn't reach Claude: \(message)"
        case .api(401, _): return "Claude rejected the API key. Check it in Settings."
        case let .api(status, message): return "Claude API error \(status): \(message)"
        case .refusal: return "The model declined to answer"
        case .maxTokens: return "The model's reply was cut off"
        case let .schema(message): return message
        case let .notFood(reason): return reason
        }
    }
}

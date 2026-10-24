import Foundation
import XCTest
@testable import CalorieCore

final class ClaudeEstimatorTests: XCTestCase {
    func testRequestShape() throws {
        let input = EstimateInput(text: "2 eggs", context: .localTime("08:14"))
        let request = try ClaudeEstimator.makeRequest(apiKey: "sk-test", input: input)
        XCTAssertEqual(request.url?.absoluteString, "https://api.anthropic.com/v1/messages")
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-api-key"), "sk-test")
        XCTAssertEqual(request.value(forHTTPHeaderField: "anthropic-version"), "2026-10-21")

        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        XCTAssertEqual(body["model"] as? String, "claude-haiku-5-5")
        XCTAssertEqual(body["max_tokens"] as? Int, 4000)
        XCTAssertNil(body["temperature"], "sampling parameters 400 on this API version")
        XCTAssertNil(body["thinking"], "thinking stays adaptive by default")
        let messages = body["messages"] as! [[String: Any]]
        XCTAssertEqual(messages[0]["content"] as? String, "Local time: 08:14\n\n2 eggs")

        let config = body["output_config"] as! [String: Any]
        XCTAssertEqual(config["effort"] as? String, "medium")
        let format = config["format"] as! [String: Any]
        XCTAssertEqual(format["type"] as? String, "json_schema")
        let schema = format["schema"] as! [String: Any]
        XCTAssertEqual(schema["additionalProperties"] as? Bool, false)
        XCTAssertEqual(Set(schema["required"] as! [String]), ["meal_type", "items", "not_food_reason"])
    }

    func testPastDayMessage() {
        let input = EstimateInput(text: "stew", context: .pastDay("Mon, Oct 12"))
        XCTAssertEqual(input.userMessage, "Logging for a past day (Mon, Oct 12)\n\nstew")
    }

    private func reply(_ text: String, stop: String = "end_turn", thinkingFirst: Bool = true) -> Data {
        var content: [[String: Any]] = [["type": "text", "text": text]]
        if thinkingFirst { content.insert(["type": "thinking", "thinking": "", "signature": "sig"], at: 0) }
        let body: [String: Any] = [
            "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-haiku-5-5",
            "stop_reason": stop, "content": content, "usage": ["input_tokens": 410, "output_tokens": 260],
        ]
        return try! JSONSerialization.data(withJSONObject: body)
    }

    private let mealJSON = """
    {"meal_type":"Breakfast","items":[
      {"name":"Scrambled eggs","portion":"2 large","calories":182.4,"protein_g":12.56,"carbs_g":1.2,"fat_g":13.8,"confidence":"HIGH","assumption":null},
      {"name":"Tortilla","portion":"1","calories":-5,"protein_g":5.8,"carbs_g":36.2,"fat_g":5.4,"confidence":"probably","assumption":"10-inch"}
    ],"not_food_reason":null}
    """

    func testParsesTheTextBlockAfterThinking() throws {
        let data = reply(mealJSON)
        let estimate = try ClaudeEstimator.parse(data: data, status: 200)
        XCTAssertEqual(estimate.model, "claude-haiku-5-5")
        XCTAssertEqual(estimate.inputTokens, 410)
        XCTAssertEqual(estimate.outputTokens, 260)
        XCTAssertEqual(estimate.rawResponse, String(decoding: data, as: UTF8.self))
        // Lenient enums, like the server's MealSchema.
        XCTAssertEqual(estimate.meal.mealType, .breakfast)
        XCTAssertEqual(estimate.meal.items.map(\.confidence), [.high, .low])
    }

    func testLocalEntryRoundsLikeTheServer() throws {
        let estimate = try ClaudeEstimator.parse(data: reply(mealJSON), status: 200)
        let entry = estimate.localEntry(text: "eggs", date: "2026-10-13", loggedAt: morning, requestedMealType: nil, localTime: "08:14")
        XCTAssertEqual(entry.mealType, .breakfast)
        XCTAssertEqual(entry.items.map(\.calories), [182, 0])
        XCTAssertEqual(entry.items[0].proteinG, 12.6)
        XCTAssertEqual(entry.items[1].assumption, "10-inch")
        XCTAssertEqual(entry.modelResponse, estimate.rawResponse)
    }

    func testMealTypeFallsBackToTheTimeOfDay() throws {
        let json = mealJSON.replacingOccurrences(of: "\"Breakfast\"", with: "\"brunch\"")
        let estimate = try ClaudeEstimator.parse(data: reply(json), status: 200)
        XCTAssertNil(estimate.meal.mealType)
        let entry = estimate.localEntry(text: "x", date: "2026-10-13", loggedAt: morning, requestedMealType: nil, localTime: "18:05")
        XCTAssertEqual(entry.mealType, .dinner)
    }

    func testNotFood() {
        let json = #"{"meal_type":null,"items":[],"not_food_reason":"That's a run, not a meal"}"#
        XCTAssertThrowsError(try ClaudeEstimator.parse(data: reply(json), status: 200)) {
            XCTAssertEqual($0 as? EstimateError, .notFood("That's a run, not a meal"))
        }
        let empty = #"{"meal_type":null,"items":[],"not_food_reason":null}"#
        XCTAssertThrowsError(try ClaudeEstimator.parse(data: reply(empty), status: 200)) {
            XCTAssertEqual($0 as? EstimateError, .notFood("No food or drink found"))
        }
    }

    func testStopReasonsAndBadOutput() {
        XCTAssertThrowsError(try ClaudeEstimator.parse(data: reply("", stop: "refusal"), status: 200)) {
            XCTAssertEqual($0 as? EstimateError, .refusal)
        }
        XCTAssertThrowsError(try ClaudeEstimator.parse(data: reply("{\"meal", stop: "max_tokens"), status: 200)) {
            XCTAssertEqual($0 as? EstimateError, .maxTokens)
        }
        XCTAssertThrowsError(try ClaudeEstimator.parse(data: reply("not json"), status: 200)) {
            guard case .schema = $0 as? EstimateError else { return XCTFail("expected a schema error, got \($0)") }
        }
    }

    func testAPIErrors() {
        let body = Data(#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#.utf8)
        XCTAssertThrowsError(try ClaudeEstimator.parse(data: body, status: 401)) {
            XCTAssertEqual($0 as? EstimateError, .api(status: 401, message: "invalid x-api-key"))
            XCTAssertEqual(($0 as? LocalizedError)?.errorDescription, "Claude rejected the API key. Check it in Settings.")
        }
    }

    func testNetworkFailureIsReported() async {
        let server = FakeServer()
        server.reachable = false
        let estimator = ClaudeEstimator(apiKey: "sk", transport: server)
        do {
            _ = try await estimator.estimate(EstimateInput(text: "eggs", context: .localTime("08:14")))
            XCTFail("expected a network error")
        } catch {
            guard case .network = error as? EstimateError else { return XCTFail("expected a network error, got \(error)") }
        }
    }
}

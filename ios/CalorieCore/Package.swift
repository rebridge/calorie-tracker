// swift-tools-version:5.9
import PackageDescription

// The app's logic that doesn't need UIKit or SwiftUI: the offline outbox, the merged day view, the Claude client
// and the sync engine. Kept separate so `swift test` can run it on any machine, Linux included.
let package = Package(
    name: "CalorieCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "CalorieCore", targets: ["CalorieCore"]),
    ],
    targets: [
        .target(name: "CalorieCore"),
        .testTarget(name: "CalorieCoreTests", dependencies: ["CalorieCore"]),
    ]
)
